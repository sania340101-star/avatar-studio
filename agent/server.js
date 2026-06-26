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
const APP_URL = process.env.APP_URL || 'http://avatar-studio.app.local';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const TMP_DIR = path.join(__dirname, 'tmp');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR);

const PREPARE_TOOLS = [
  'Read',
  'mcp__fal-ai__search_models',
  'mcp__fal-ai__recommend_model',
  'mcp__fal-ai__get_model_schema',
  'mcp__fal-ai__get_pricing',
].join(',');

const GENERATE_TOOLS = [
  'Read',
  'mcp__fal-ai__run_model',
  'mcp__fal-ai__submit_job',
  'mcp__fal-ai__check_job',
  'mcp__fal-ai__get_job_result',
  'mcp__fal-ai__get_model_schema',
  'mcp__fal-ai__upload_file',
].join(',');

const IMAGE_PREPARE_SYSTEM = `You are an image generation agent for Avatar Studio (HYPERVSN).

Your job: analyze the user's instruction and recommend the best model + craft an optimal prompt. Do NOT generate yet.

Steps:
1. Understand the user's request — put the user's intent FIRST
2. If model is "auto" or not specified, use recommend_model to find the best model
3. If the user has reference images, pick a model that supports image references (image-to-image, edit, or reference-based models). Do NOT pick a text-only model when references are provided.
4. Optionally use get_model_schema to check supported parameters
5. Craft an optimal prompt in English for the selected model

# Reference images
The user may upload reference images. These will be sent to the fal.ai model as ordered inputs.
- In your prompt, refer to them as "the first reference image", "the second reference image", etc.
- Your prompt MUST describe what to do with each reference: e.g. "Create a photorealistic version of the person in the first reference image"
- The order in your prompt must match the order of the reference URLs provided
- If the user says "like the reference" or "similar to image 1", your prompt must explicitly reference that image

# Prompt rules
- Put the user's instruction first. Your prompt must explicitly fulfill what the user asked.
- Write detailed, specific prompts: lighting, materials, composition, depth, quality
- Translate the user's instruction to English but preserve all their requirements
- Apply the User Style Instructions (HYPERVSN requirements) to every prompt

Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation of why this model and prompt"
}`;

const IMAGE_GENERATE_SYSTEM = `You are an image generation agent for Avatar Studio (HYPERVSN).

Your job: generate an image using the given prompt and model via fal-ai MCP tools. The user has already reviewed and approved the prompt.

Steps:
1. Use run_model with the specified model and prompt
2. If reference images are provided, pass them to the model as image_url or reference inputs (check model schema for the correct parameter name)
3. Return the result

Return ONLY a JSON object:
{
  "images": [{"url": "https://..."}],
  "prompt": "the prompt used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name"
}`;

const VIDEO_PREPARE_SYSTEM = `You are a video generation agent for Avatar Studio (HYPERVSN).

Your job: analyze the user's instruction and recommend the best model + craft an optimal prompt. Do NOT generate yet.

Steps:
1. Understand the user's request — put the user's intent FIRST
2. If model is "auto" or not specified, use recommend_model to find the best model
3. If the user has source images/videos, pick a model that supports them (image-to-video, video-edit, etc.)
4. Optionally use get_model_schema to check supported parameters
5. Craft an optimal prompt in English for the selected model

# Reference handling
- Source images/videos will be sent to the fal.ai model as inputs
- In your prompt, refer to them explicitly: "the source image", "the reference video"
- Describe what to do with each reference in the prompt
- For motion-control models: describe only environment/lighting/style, NOT motion (motion comes from the reference video)
- For talking avatars with audio: prompt is optional (style/lighting hint only)

# Prompt rules
- Put the user's instruction first. Fulfill what the user asked.
- Write detailed prompts: lighting, camera, motion, atmosphere, quality
- Break video into time segments when appropriate: "0-3s: ... 3-6s: ..."
- Use cinematic language: "rack focus", "dolly in", "rim lighting"
- Translate the user's instruction to English but preserve all requirements
- Apply the User Style Instructions to every prompt
- Do NOT put resolution or FPS in the prompt text (separate API parameters)

Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation of why this model and prompt"
}`;

const VIDEO_GENERATE_SYSTEM = `You are a video generation agent for Avatar Studio (HYPERVSN).

Your job: generate a video using the given prompt and model via fal-ai MCP tools. The user has already reviewed and approved the prompt.

Steps:
1. Use submit_job with the specified model and prompt
2. If source images/videos are provided, pass them to the model as the appropriate input parameters
3. Use check_job to poll until complete
4. Use get_job_result to get the result
5. Return the result

Return ONLY a JSON object:
{
  "video": {"url": "https://..."},
  "prompt": "the prompt used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name"
}`;

function downloadFile(url) {
  const fullUrl = url.startsWith('/') ? `${APP_URL}${url}` : url;
  return new Promise((resolve, reject) => {
    const ext = path.extname(new URL(fullUrl).pathname) || '.jpg';
    const tmpFile = path.join(TMP_DIR, `ref-${randomUUID()}${ext}`);
    const proto = fullUrl.startsWith('https') ? require('https') : require('http');
    proto.get(fullUrl, (res) => {
      if (res.statusCode !== 200) return reject(new Error(`Download failed: ${res.statusCode}`));
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        writeFileSync(tmpFile, Buffer.concat(chunks));
        resolve(tmpFile);
      });
      res.on('error', reject);
    }).on('error', reject);
  });
}

async function downloadReferences(refs) {
  if (!refs?.length) return [];
  const results = [];
  for (const url of refs) {
    try {
      const tmpFile = await downloadFile(url);
      results.push(tmpFile);
    } catch (e) {
      console.error(`[agent] Failed to download ref ${url}:`, e.message);
    }
  }
  return results;
}

async function getBestClaudeKey() {
  const res = await fetch(`${AF_URL}/api/internal/best-claude-key`, {
    headers: { 'x-service-key': SERVICE_KEY },
  });
  if (!res.ok) throw new Error(`Key pool error: ${res.status}`);
  const data = await res.json();
  if (!data.ok) throw new Error(data.error || 'No key available');
  return data.token;
}

function buildPrompt(body, imageFiles) {
  const { type, instruction, model, size, references, duration, aspectRatio } = body;
  const parts = [];

  if (references?.length) {
    const refList = references.map((url, i) => `  ${i + 1}. ${url}`).join('\n');
    parts.push(`Reference images (${references.length} total, ordered):\n${refList}\nThe model will receive these images in this exact order. Use "the first reference image", "the second reference image" etc. in your prompt.`);
  }

  if (imageFiles?.length) {
    parts.push(`\nIMPORTANT: Use the Read tool to view each reference image file below. Analyze what you see and use those details in your prompt.`);
    imageFiles.forEach((f, i) => {
      parts.push(`Reference image ${i + 1} file: ${f}`);
    });
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

function callClaude(token, mcpConfig, systemPrompt, userPrompt, tools) {
  return new Promise((resolve, reject) => {
    const args = [
      '--print', '--output-format', 'json',
      '--max-turns', '15',
      '--model', 'haiku',
      '--mcp-config', mcpConfig,
      '--allowedTools', tools,
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

  const isPrepare = req.method === 'POST' && req.url.startsWith('/prepare');
  const isGenerate = req.method === 'POST' && req.url.startsWith('/generate');

  if (!isPrepare && !isGenerate) {
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
  let imageFiles = [];

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

    let systemPrompt, tools;
    if (isPrepare) {
      systemPrompt = type === 'video' ? VIDEO_PREPARE_SYSTEM : IMAGE_PREPARE_SYSTEM;
      tools = PREPARE_TOOLS;
    } else {
      systemPrompt = type === 'video' ? VIDEO_GENERATE_SYSTEM : IMAGE_GENERATE_SYSTEM;
      tools = GENERATE_TOOLS;
    }

    if (body.systemPrompt) {
      systemPrompt += `\n\n# User Style Instructions\n${body.systemPrompt}`;
    }

    const allRefs = [...(body.references || [])];
    if (body.sourceImage) allRefs.push(body.sourceImage);
    imageFiles = await downloadReferences(allRefs);

    const userPrompt = buildPrompt(body, imageFiles);
    const action = isPrepare ? 'prepare' : 'generate';

    console.log(`[agent] ${type} ${action} started (${id}), refs: ${imageFiles.length}`);
    const result = await callClaude(claudeToken, mcpConfig, systemPrompt, userPrompt, tools);
    console.log(`[agent] ${type} ${action} complete (${id})`);

    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (e) {
    console.error(`[agent] error (${id}):`, e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    try { unlinkSync(mcpConfig); } catch {}
    for (const f of imageFiles) { try { unlinkSync(f); } catch {} }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] Avatar Studio agent wrapper listening on :${PORT}`);
});
