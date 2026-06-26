const http = require('http');
const { execFile } = require('child_process');
const { writeFileSync, unlinkSync, mkdirSync, existsSync, readFileSync } = require('fs');
const { randomUUID } = require('crypto');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m && !process.env[m[1].trim()]) process.env[m[1].trim()] = m[2].trim();
  }
}

const PORT = parseInt(process.env.AGENT_PORT || '3391', 10);
const AF_URL = process.env.AF_INTERNAL_URL || 'http://172.18.32.73:3380';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const TMP_DIR = path.join(__dirname, 'tmp');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR);

const FAL_TOOLS = [
  'mcp__fal-ai__run_model',
  'mcp__fal-ai__submit_job',
  'mcp__fal-ai__check_job',
  'mcp__fal-ai__get_job_result',
  'mcp__fal-ai__search_models',
  'mcp__fal-ai__recommend_model',
  'mcp__fal-ai__get_model_schema',
  'mcp__fal-ai__get_pricing',
  'mcp__fal-ai__upload_file',
].join(',');

const IMAGE_SYSTEM = `You are an image generation agent for Avatar Studio (HYPERVSN).

Your job: take the user's instruction and generate an image using fal-ai MCP tools.

Steps:
1. Understand the user's request
2. If model is "auto" or not specified, use recommend_model to find the best model
3. Craft an optimal prompt in English for the selected model
4. Use run_model to generate the image
5. Return the result

For HYPERVSN content: prefer black backgrounds, 3D look, clean studio lighting.

Return ONLY a JSON object:
{
  "images": [{"url": "https://..."}],
  "prompt": "the prompt you used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation"
}`;

const VIDEO_SYSTEM = `You are a video generation agent for Avatar Studio (HYPERVSN).

Your job: take the user's instruction and generate a video using fal-ai MCP tools.

Steps:
1. Understand the user's request
2. If model is "auto" or not specified, use recommend_model to find the best model
3. Craft an optimal prompt for the selected model
4. Use submit_job + check_job + get_job_result to generate (videos take longer)
5. Return the result

Return ONLY a JSON object:
{
  "video": {"url": "https://..."},
  "prompt": "the prompt you used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation"
}`;

async function getBestClaudeKey() {
  const res = await fetch(`${AF_URL}/api/internal/best-claude-key`, {
    headers: { 'x-service-key': SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`Key pool error: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'No key available');
  return data.token;
}

function buildPrompt(body) {
  const { type, instruction, model, size, references, duration, aspectRatio } = body;
  const parts = [];

  if (references?.length) {
    parts.push(`Reference images: ${references.join(', ')}`);
  }

  if (model && model !== 'auto') {
    parts.push(`Use model: ${model}`);
  }

  if (type === 'video') {
    if (duration) parts.push(`Duration: ${duration} seconds`);
    if (body.sourceImage) parts.push(`Source image: ${body.sourceImage}`);
    if (body.sourceVideo) parts.push(`Source video: ${body.sourceVideo}`);
    if (body.audioUrl) parts.push(`Audio: ${body.audioUrl}`);
  } else {
    if (size) parts.push(`Image size: ${size}`);
    if (aspectRatio) parts.push(`Aspect ratio: ${aspectRatio}`);
  }

  parts.push(`\nUser instruction:\n${instruction}`);

  return parts.join('\n');
}

function callClaude(token, mcpConfig, systemPrompt, userPrompt) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', '--output-format', 'json',
      '--max-turns', '15',
      '--model', 'haiku',
      '--mcp-config', mcpConfig,
      '--allowedTools', FAL_TOOLS,
      '--system-prompt', systemPrompt,
      '-p', userPrompt,
    ];

    const env = { ...process.env, CLAUDE_CODE_OAUTH_TOKEN: token };

    execFile('claude', args, {
      env,
      timeout: 300000,
      maxBuffer: 5 * 1024 * 1024,
      cwd: __dirname,
    }, (err, stdout, stderr) => {
      if (err && !stdout) return reject(new Error(stderr || err.message));
      try {
        const parsed = JSON.parse(stdout);
        const text = parsed.result || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          resolve(JSON.parse(jsonMatch[0]));
        } else {
          resolve({ text, raw: true });
        }
      } catch {
        resolve({ text: stdout, raw: true });
      }
    });
  });
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => { data += chunk; });
    req.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch { reject(new Error('Invalid JSON body')); }
    });
    req.on('error', reject);
  });
}

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    res.end(JSON.stringify({ ok: true, version: '1.0.0' }));
    return;
  }

  if (req.method !== 'POST' || !req.url.startsWith('/generate')) {
    res.statusCode = 404;
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  const serviceKey = req.headers['x-service-key'];
  if (!SERVICE_KEY || serviceKey !== SERVICE_KEY) {
    res.statusCode = 403;
    res.end(JSON.stringify({ error: 'Invalid service key' }));
    return;
  }

  let body;
  try { body = await parseBody(req); }
  catch (e) { res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); return; }

  const { falKey, type = 'image', instruction } = body;

  if (!falKey) { res.statusCode = 400; res.end(JSON.stringify({ error: 'falKey required' })); return; }
  if (!instruction) { res.statusCode = 400; res.end(JSON.stringify({ error: 'instruction required' })); return; }

  const id = randomUUID();
  const mcpConfig = path.join(TMP_DIR, `mcp-${id}.json`);

  try {
    const claudeToken = await getBestClaudeKey();

    writeFileSync(mcpConfig, JSON.stringify({
      mcpServers: {
        'fal-ai': {
          type: 'http',
          url: 'https://mcp.fal.ai/mcp',
          headers: { Authorization: `Key ${falKey}` },
        },
      },
    }));

    const systemPrompt = type === 'video' ? VIDEO_SYSTEM : IMAGE_SYSTEM;
    const userPrompt = buildPrompt(body);

    console.log(`[agent] ${type} generation started (${id})`);
    const result = await callClaude(claudeToken, mcpConfig, systemPrompt, userPrompt);
    console.log(`[agent] ${type} generation complete (${id})`);

    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (e) {
    console.error(`[agent] error (${id}):`, e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    try { unlinkSync(mcpConfig); } catch {}
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] Avatar Studio agent wrapper listening on :${PORT}`);
});
