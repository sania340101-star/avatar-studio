const fs = require('fs');
const file = '/srv/workspaces/system/avatar-studio/agent/server.js';
let code = fs.readFileSync(file, 'utf8');

// Find the pricing block boundaries
const startMarker = '  if (isPricing) {';
const endMarker = '    return;\n  }';

const startIdx = code.indexOf(startMarker, code.indexOf('isPricing'));
// Find the "return;\n  }" that ends the pricing block (after the finally block)
let searchFrom = startIdx;
let endIdx = -1;
// The pricing block ends with "    return;\n  }" right before the prepare/generate handling
for (let i = 0; i < 5; i++) {
  const idx = code.indexOf(endMarker, searchFrom);
  if (idx === -1) break;
  // Check if this is after "finally" - the pricing block's return
  const slice = code.slice(startIdx, idx + endMarker.length);
  if (slice.includes('finally')) {
    endIdx = idx + endMarker.length;
    break;
  }
  searchFrom = idx + 1;
}

if (startIdx === -1 || endIdx === -1) {
  console.error('Could not find pricing block boundaries');
  console.log('startIdx:', startIdx, 'endIdx:', endIdx);
  process.exit(1);
}

console.log('Found pricing block at', startIdx, '-', endIdx);
console.log('Block length:', endIdx - startIdx);

const newBlock = `  if (isPricing) {
    const { falKey, modelId } = body;
    if (!falKey) { res.statusCode = 400; res.end(JSON.stringify({ error: 'falKey required' })); return; }
    if (!modelId) { res.statusCode = 400; res.end(JSON.stringify({ error: 'modelId required' })); return; }

    const cached = pricingCache.get(modelId);
    if (cached && Date.now() - cached.ts < PRICING_TTL) {
      res.end(JSON.stringify({ ok: true, cached: true, ...cached.data }));
      return;
    }

    try {
      console.log(\`[agent] pricing lookup for \${modelId} (direct MCP)\`);
      const mcpBody = JSON.stringify({
        jsonrpc: '2.0',
        method: 'tools/call',
        params: { name: 'get_pricing', arguments: { endpoint_id: modelId } },
        id: 1,
      });
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const mcpRes = await fetch('https://mcp.fal.ai/mcp', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream',
          'Authorization': \`Key \${falKey}\`,
        },
        body: mcpBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const mcpText = await mcpRes.text();
      // Parse SSE response: "event: message\\ndata: {...}"
      const dataMatch = mcpText.match(/^data: (.+)$/m);
      if (!dataMatch) throw new Error('No data in MCP response');
      const mcpData = JSON.parse(dataMatch[1]);
      if (mcpData.result?.isError) throw new Error(mcpData.result.content?.[0]?.text || 'MCP error');
      const pricingText = mcpData.result?.content?.[0]?.text;
      if (!pricingText) throw new Error('Empty pricing response');
      const pricing = JSON.parse(pricingText);
      const price = pricing.prices?.[0];
      if (!price) throw new Error('No price data');
      const result = {
        amount: price.unit_price,
        currency: price.currency || 'USD',
        details: price.unit ? \`per \${price.unit}\` : '',
      };
      pricingCache.set(modelId, { ts: Date.now(), data: result });
      console.log(\`[agent] pricing result for \${modelId}: $\${result.amount}/\${price.unit || 'run'}\`);
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      console.error(\`[agent] pricing error for \${modelId}:\`, e.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
    return;
  }`;

code = code.slice(0, startIdx) + newBlock + code.slice(endIdx);
fs.writeFileSync(file, code);
console.log('Pricing endpoint patched successfully');
