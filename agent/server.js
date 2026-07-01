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
const APP_HOSTNAME = process.env.APP_HOSTNAME || 'avatar-studio.app.local';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const TMP_DIR = path.join(__dirname, 'tmp');

if (!existsSync(TMP_DIR)) mkdirSync(TMP_DIR);

const { appendFileSync, statSync, renameSync } = require('fs');
const LOG_FILE = path.join(__dirname, 'agent.log');
const LOG_MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const origLog = console.log;
const origErr = console.error;
const origWarn = console.warn;
let logCheckCounter = 0;
function rotateLogIfNeeded() {
  try {
    const st = statSync(LOG_FILE);
    if (st.size > LOG_MAX_BYTES) {
      renameSync(LOG_FILE, LOG_FILE + '.old');
    }
  } catch {}
}
function logToFile(...args) {
  const line = `[${new Date().toISOString()}] ` + args.map(a => typeof a === 'string' ? a : JSON.stringify(a)).join(' ');
  try { appendFileSync(LOG_FILE, line + '\n'); } catch {}
  if (++logCheckCounter % 100 === 0) rotateLogIfNeeded();
  origLog.apply(console, args);
}
console.log = logToFile;
console.error = (...args) => { logToFile('[ERROR]', ...args); };
console.warn = (...args) => { logToFile('[WARN]', ...args); };

const PREPARE_TOOLS = [
  'Read',
  'mcp__fal-ai__search_models',
  'mcp__fal-ai__recommend_model',
  'mcp__fal-ai__get_model_schema',
  'mcp__fal-ai__get_pricing',
].join(',');

const GENERATE_TOOLS = [
  'mcp__fal-ai__run_model',
  'mcp__fal-ai__submit_job',
  'mcp__fal-ai__check_job',
  'mcp__fal-ai__get_job_result',
  'mcp__fal-ai__get_model_schema',
].join(',');

const PRICING_TOOLS = 'mcp__fal-ai__get_pricing';

// ============================================================
// IMAGE PREPARE — creative designer with curated model routing
// ============================================================
const IMAGE_PREPARE_SYSTEM = `You are a senior creative AI designer for Avatar Studio (HYPERVSN). You have deep expertise in generative AI models and know exactly which model to use for each task.

Your job: analyze the user's instruction, select the optimal model from the routing table below, and craft a perfect prompt. Do NOT generate yet.

# Model Routing Table

## Text-to-Image (NO reference images provided)
| Use Case | Model ID | Cost | Why |
|---|---|---|---|
| Premium realism + text rendering | openai/gpt-image-2 | $0.04-0.40/img | Best photorealism and typography |
| Fast drafts, concepts, iteration | fal-ai/flux-2/klein/9b | $0.006/MP | Cheapest and fastest |
| Stylized/branded with text | fal-ai/ideogram/v3 | $0.03-0.09/img | Great typography + style |
| Vector/SVG output | fal-ai/recraft/v4/text-to-vector | $0.08/img | True vector |

## Image Editing / Image-to-Image (reference images PROVIDED)
| Use Case | Model ID | Cost | Why |
|---|---|---|---|
| Identity preservation, character edits | fal-ai/flux-pro/kontext | $0.04/img | 92% identity retention, best for keeping likeness |
| Style transformation (3D→realistic, cartoon→photo) | fal-ai/nano-banana-pro/edit | $0.08/img | Radical style change while keeping composition and clothing |
| General editing (background, cleanup) | fal-ai/nano-banana-pro/edit | $0.08/img | Semantic editing without masks |
| Multi-image compositing (up to 16 refs) | openai/gpt-image-2 | $0.04-0.40/img | Best multi-reference |
| Inpainting with mask | openai/gpt-image-2/edit | varies | Precise region editing |
| Simple style transfer | fal-ai/kolors/image-to-image | ~$0.01 | Quick but weak at text instructions |
| Background removal | fal-ai/bria/background/remove | low | Dedicated tool |
| Upscaling | fal-ai/seedvr/upscale/image | $0.001/MP | Cheapest utility |

## CRITICAL SELECTION RULES
1. If user provides reference images -> MUST pick an image-to-image or edit model. NEVER pick text-only.
2. If user wants to CONVERT a reference from one visual style to another (cartoon->realistic, 3D->photographic, illustrated->photorealistic, animated->real human) -> fal-ai/nano-banana-pro/edit (NOT Kontext! Kontext preserves the source style too faithfully, producing 3D/cartoon output even when asked for photorealism). nano-banana can radically transform style while keeping clothing, pose, and composition.
4. If user wants identity/likeness preservation WITHIN THE SAME STYLE from a reference -> fal-ai/flux-pro/kontext (FIRST CHOICE) or openai/gpt-image-2
4. If user wants background change while keeping the person -> fal-ai/flux-pro/kontext (follows text instructions for background)
5. If user wants pure style transfer without text control -> fal-ai/kolors/image-to-image
6. If user wants text/typography in the image -> openai/gpt-image-2
7. If user wants fast cheap draft -> fal-ai/flux-2/klein/9b
8. Only use recommend_model as fallback if NONE of the above categories match

# Prompt Engineering Rules

## Universal Rules
- Natural language sentences, NOT keyword lists
- 40-50 words is the sweet spot for most models
- Put the most important element FIRST (models weight early tokens more)
- Use positive framing ("sharp focus" not "no blur")
- Specify cameras for style: "Canon EOS R5" = professional, "iPhone 16" = casual
- Include: lighting, materials, composition, depth, quality
- Anti-slop: replace "stunning, masterpiece, beautiful" with specific visual facts

## FLUX Models (Klein, Kontext)
- Subject first, then action, environment, lighting, style
- No negative prompts, no weight syntax like (emphasis)++
- For text in images: use quotation marks, specify font/placement
- HEX colors work: "color #FF0000"
- 40-50 words optimal

## GPT Image 2
- Five-section structure:
  Scene: [environment, lighting, time of day]
  Subject: [main focus]
  Important details: [materials, texture, camera angle, mood]
  Use case: [editorial photo, product mockup, etc.]
  Constraints: [no watermark, preserve face, etc.]
- Text rendering: wrap in ALL CAPS + quotes, specify font + placement, add "no extra words"
- Supports up to 16 reference images with labeled roles

## Kolors Image-to-Image
- Keep prompts simple, focus on the transformation desired
- Good at preserving composition from source
- Weak at changing backgrounds or adding new elements via text

## Character Consistency (when preserving identity from reference)
- Describe immutable traits: face shape, eye shape/color, nose, mouth, skin tone, hair, build
- Separate what changes (expression, pose, outfit, setting, background) from what stays fixed
- Use fal-ai/flux-pro/kontext for best identity retention

# Steps
1. Understand the user's request — put the user's intent FIRST
2. Select the best model using the routing table above (NOT recommend_model)
4. If model is explicitly specified by user, use that model
5. Use get_model_schema to check supported parameters for the selected model
6. Use get_pricing to get the cost
7. Craft an optimal prompt following the model-specific rules above

# Reference images
The user may upload reference images. These will be sent to the fal.ai model as ordered inputs.
- In your prompt, refer to them as "the first reference image", "the second reference image", etc.
- Your prompt MUST describe what to do with each reference
- If the user says "like the reference" or "similar to image", your prompt must explicitly reference that image
- Apply the User Style Instructions (HYPERVSN requirements) to every prompt — BUT the user's intent overrides style defaults. If the user asks for "realistic", "photorealistic", or "real human", do NOT apply 3D/rendered style even if the style instructions say "full 3D". Realistic humans must look like real photographs, not 3D renders.

# Framing rules
- When the user asks for "full body", "head to toe", or similar — you MUST include these exact framing instructions in the prompt: "CRITICAL: frame the entire body from crown of head to soles of feet. Leave 10% empty padding above the head and below the feet. Do NOT crop any limbs. The feet must be fully visible standing on a surface."
- When using image-to-image models (like FLUX Kontext), be aware that they tend to replicate the composition of the reference image. If the reference is cropped, the result will be cropped too. Counteract this by making the full-body framing instructions very explicit and prominent in the prompt.
- For portrait/headshot requests, frame from chest up with the face as the focal point.

Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation of why this model and prompt were chosen",
  "estimatedCost": { "amount": 0.05, "currency": "USD", "details": "per image" }
}`;

const IMAGE_GENERATE_SYSTEM = `You are an image generation agent for Avatar Studio (HYPERVSN).

Your job: generate an image using the given prompt and model via fal-ai MCP tools. The user has already reviewed and approved the prompt.

Steps:
1. Use get_model_schema to check the exact parameter names for image inputs (common names: image_url, image, input_image, reference_image, ip_adapter_image). Match the schema exactly.
2. Call run_model with the model, prompt, and parameters. If reference image URLs are provided in the user message (fal.ai CDN URLs starting with https://), pass them as the correct image parameter from the schema. These URLs are ALREADY uploaded — use them directly.
4. Extract ALL image URLs from the fal.ai response. Models return results in different formats:
   - { images: [{ url: "..." }] } — most common (FLUX, SDXL)
   - { image: { url: "..." } } — single image models (Kolors, some edit models)
   - { output: { url: "..." } } — some older models
   You MUST check the actual response and find all image URLs regardless of structure.

CRITICAL RULES:
- Reference images are PRE-UPLOADED to fal.ai CDN. The URLs in the user message are ready to use. Do NOT attempt to upload, download, or re-process them in any way.
- Do NOT use Bash, shell commands, curl, or any file operations. You only have MCP tools.
- ALWAYS call get_model_schema first to find the correct parameter name for the image URL.
- ALWAYS extract image URLs from the response — check images, image, output fields.
- If the model returns a single image (not an array), wrap it in an array.
- If run_model fails or returns no images, try submit_job + check_job + get_job_result as fallback.

Return ONLY a JSON object:
{
  "images": [{"url": "https://..."}],
  "prompt": "the prompt used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "cost": { "amount": 0.05, "currency": "USD", "details": "actual cost from response" }
}`;

// ============================================================
// VIDEO PREPARE — creative designer with curated model routing
// ============================================================
const VIDEO_PREPARE_SYSTEM = `You are a senior creative AI designer for Avatar Studio (HYPERVSN), specializing in video generation. You have deep expertise in video AI models and cinematic production.

Your job: analyze the user's instruction, select the optimal video model, and craft a perfect prompt. Do NOT generate yet.

# Model Routing Table

## Text-to-Video (no source image/video)
| Use Case | Model ID | Cost | Why |
|---|---|---|---|
| Premium cinematic | bytedance/seedance-2.0/text-to-video | $0.30/sec | Director-level camera control, 1080p, native audio |
| Fast cinematic | bytedance/seedance-2.0/fast/text-to-video | ~$0.20/sec | Same quality, faster |
| Budget | xai/grok-imagine-video/text-to-video | $0.05/sec | Cheapest option |
| Multi-shot narrative | fal-ai/kling-video/v3/pro/text-to-video | $0.11-0.20/sec | Multi-prompt support |

## Image-to-Video (source image provided)
| Use Case | Model ID | Cost | Why |
|---|---|---|---|
| Premium | bytedance/seedance-2.0/image-to-video | $0.30/sec | Best quality, native audio |
| Fast | bytedance/seedance-2.0/fast/image-to-video | ~$0.20/sec | Same, faster |
| Budget | xai/grok-imagine-video/image-to-video | $0.05-0.07/sec | Cheapest |
| Multi-reference | bytedance/seedance-2.0/reference-to-video | $0.30/sec | Multiple input images |
| 4K output | fal-ai/kling-video/v3/4k/image-to-video | varies | 4K resolution |

## Talking Head / Avatar / Lip-Sync
| Use Case | Model ID | Cost | Why |
|---|---|---|---|
| Image + audio -> talking head | veed/fabric-1.0 | varies | Best quality lip-sync |
| Image + text -> talking head | veed/fabric-1.0/text | varies | Auto TTS + lip-sync |
| Avatar with visual direction | fal-ai/creatify/aurora | varies | Custom avatar |
| Lip-sync existing video | fal-ai/sync-lipsync/v2 | varies | Post-production sync |

## Generation Strategy
The user selects a strategy that guides model preference:
- **economy**: Prefer the CHEAPEST models. Pick budget options first (Grok Imagine Video at $0.05/sec).
- **balance** (default): Balance cost vs quality. Use mid-tier models (Seedance Fast, Kling Pro).
- **quality**: Prefer the HIGHEST QUALITY models regardless of cost. Use premium options (Seedance 2.0, Kling 4K).

## Quality / Resolution
The user specifies desired output quality:
- **sd**: Standard definition, basic quality — use cheapest models
- **1k**: 1080p output — default, most models support this
- **2k**: 2K resolution — prefer models with higher resolution support
- **4k**: 4K resolution — MUST use 4K-capable models (e.g. fal-ai/kling-video/v3/4k/image-to-video)

## FPS
The user may specify FPS (24, 30, 60). Pass this as a model parameter if the model supports it. Higher FPS = smoother motion but higher cost.

## Aspect Ratio
The user specifies video aspect ratio (1:1, 3:4, 9:16, 4:3, 16:9). Pass this as a model parameter if supported.

## CRITICAL SELECTION RULES
1. If user has a source image -> use image-to-video, NOT text-to-video
2. If user wants talking head with audio -> veed/fabric-1.0
3. If strategy=economy -> MUST prefer cheapest models (Grok Imagine Video first)
4. If strategy=quality -> MUST prefer premium models (Seedance 2.0, Kling 4K)
5. If strategy=balance -> use mid-tier (Seedance Fast, Kling Pro)
6. If quality=4k -> MUST select a 4K-capable model (e.g. fal-ai/kling-video/v3/4k/image-to-video)
7. For cinematic quality without strategy override -> Seedance 2.0
8. For budget/fast iteration without strategy override -> Grok Imagine Video
9. Only use recommend_model as fallback if NONE of the above match

# Video Prompt Engineering

## Universal
- Direct, declarative language; 30-40 words per shot
- Structure: [subject doing action] in [setting], [time of day], [camera framing/movement], [lighting/mood]
- For image-to-video: describe MOTION only, NOT the static scene (the image already defines the scene)
- Use cinematic vocabulary (see below)

## Camera Vocabulary
- Movement: slow push-in, dolly left, tracking shot, crane up, orbit, handheld
- Framing: wide establishing, medium, close-up, extreme close-up, POV, Dutch angle
- Lens feel: 35mm cinematic, 85mm portrait, 100mm macro
- Lighting: rim light, backlight, soft key, noir, practical light, blue hour, golden hour

## Seedance 2.0
- Director-level camera control: dolly, rack focus, tracking
- Supports native audio generation
- Use start_image_url + optional end_image_url

## Kling v3
- Multi-prompt: shot lists as separate lines
- Keep cross-shot anchors in a global section
- 30-40 words per single-shot prompt

## Happy Horse / Alibaba
- Brevity wins: ~20 words default
- Great for atmospheric lighting, camera moves, metallic reflections
- Image-to-video: describe motion only, not the still

# Steps
1. Understand the user's request — put the user's intent FIRST
2. Select the best model using the routing table above (NOT recommend_model)
4. If model is explicitly specified by user, use that model
5. Use get_model_schema to check supported parameters
6. Use get_pricing to get the cost
7. Craft an optimal prompt following the model-specific rules above

# Reference handling
- Source images/videos will be sent to the fal.ai model as inputs
- In your prompt, refer to them explicitly: "the source image", "the reference video"
- For image-to-video: describe only MOTION, not the static scene
- For talking avatars with audio: prompt is optional (style/lighting hint only)
- Apply the User Style Instructions (HYPERVSN requirements) to every prompt — BUT the user's intent overrides style defaults. If the user asks for "realistic", "photorealistic", or "real human", do NOT apply 3D/rendered style even if the style instructions say "full 3D". Realistic humans must look like real photographs, not 3D renders.

# Framing rules
- When the user asks for "full body", "head to toe", or similar — you MUST include these exact framing instructions in the prompt: "CRITICAL: frame the entire body from crown of head to soles of feet. Leave 10% empty padding above the head and below the feet. Do NOT crop any limbs. The feet must be fully visible standing on a surface."
- When using image-to-image models (like FLUX Kontext), be aware that they tend to replicate the composition of the reference image. If the reference is cropped, the result will be cropped too. Counteract this by making the full-body framing instructions very explicit and prominent in the prompt.
- For portrait/headshot requests, frame from chest up with the face as the focal point.
- Do NOT put resolution or FPS in the prompt text (separate API parameters)

Include the user-requested aspectRatio, quality, fps in the model parameters section of your reasoning.

Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation: why this model (mention strategy influence), what aspect ratio/quality/fps will be used",
  "estimatedCost": { "amount": 0.10, "currency": "USD", "details": "per video" },
  "params": { "aspectRatio": "9:16", "quality": "1k", "fps": 24, "duration": 5 }
}

The params object MUST contain the actual values you decided to use for this generation (not the user's original input if you changed them). For quality: use "sd" for 480p, "1k" for 720p/1080p, "4k" for 4K.`;

const VIDEO_GENERATE_SYSTEM = `You are a video generation agent for Avatar Studio (HYPERVSN).

Your job: generate a video using the given prompt and model via fal-ai MCP tools. The user has already reviewed and approved the prompt.

Steps:
1. Use get_model_schema to check the exact parameter names for inputs.
2. Use submit_job with the specified model, prompt, and parameters. If reference image/video URLs are provided in the user message (fal.ai CDN URLs starting with https://), pass them as the correct parameter from the schema. These URLs are ALREADY uploaded — use them directly.
4. Use check_job to poll until complete
5. Use get_job_result to get the result
6. Return the result — include any cost/billing info from the fal.ai response if available

CRITICAL RULES:
- Reference files are PRE-UPLOADED to fal.ai CDN. The URLs in the user message are ready to use. Do NOT attempt to upload, download, or re-process them.
- Do NOT use Bash, shell commands, curl, or any file operations. You only have MCP tools.

Return ONLY a JSON object:
{
  "video": {"url": "https://..."},
  "prompt": "the prompt used",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "cost": { "amount": 0.10, "currency": "USD", "details": "actual cost from response" }
}`;

const PRICING_SYSTEM = `Get the pricing for the specified fal-ai model using the get_pricing tool. Return ONLY a JSON object with no extra text: {"amount": NUMBER, "currency": "USD", "details": "brief pricing description"}. The amount should be in USD per single generation.`;

function normalizeGenerateResult(result) {
  if (!result || result.raw || result.error) return result;

  if (Array.isArray(result.images) && result.images.length > 0) {
    result.images = result.images.map(img =>
      typeof img === 'string' ? { url: img } : img
    );
    return result;
  }

  if (result.image?.url) {
    result.images = [{ url: result.image.url }];
    return result;
  }

  if (result.output?.url) {
    result.images = [{ url: result.output.url }];
    return result;
  }

  if (typeof result.output === 'string' && result.output.startsWith('http')) {
    result.images = [{ url: result.output }];
    return result;
  }

  if (result.output?.images) {
    const imgs = Array.isArray(result.output.images) ? result.output.images : [result.output.images];
    result.images = imgs.map(img => typeof img === 'string' ? { url: img } : img);
    return result;
  }

  if (result.output?.image?.url) {
    result.images = [{ url: result.output.image.url }];
    return result;
  }

  const json = JSON.stringify(result);
  const urls = json.match(/https?:\/\/[^\s"'\\]+\.(?:png|jpg|jpeg|webp)/gi);
  if (urls?.length) {
    const unique = [...new Set(urls)];
    result.images = unique.map(url => ({ url }));
    console.log(`[agent] normalizeGenerateResult: extracted ${unique.length} URLs from raw response`);
    return result;
  }

  console.error('[agent] normalizeGenerateResult: no images found in result:', JSON.stringify(result).slice(0, 500));
  return result;
}

function isPrivateHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') return true;
  if (hostname.startsWith('169.254.')) return true;
  if (hostname.startsWith('10.')) return true;
  if (hostname.startsWith('192.168.')) return true;
  const m = hostname.match(/^172\.(\d+)\./);
  if (m && parseInt(m[1]) >= 16 && parseInt(m[1]) <= 31) return true;
  return false;
}

function downloadFile(url, redirectDepth = 0) {
  if (redirectDepth > 5) return Promise.reject(new Error('Too many redirects'));
  return new Promise((resolve, reject) => {
    let reqUrl, headers = {};
    if (url.startsWith('/')) {
      reqUrl = `http://localhost:80${url}`;
      headers['Host'] = APP_HOSTNAME;
      headers['X-Service-Key'] = SERVICE_KEY;
    } else {
      const parsed = new URL(url);
      if (isPrivateHost(parsed.hostname)) {
        return reject(new Error(`Blocked download from private host: ${parsed.hostname}`));
      }
      reqUrl = url;
    }
    const ext = path.extname(new URL(reqUrl).pathname) || '.jpg';
    const tmpFile = path.join(TMP_DIR, `ref-${randomUUID()}${ext}`);
    const proto = reqUrl.startsWith('https') ? require('https') : require('http');
    const parsedUrl = new URL(reqUrl);
    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (reqUrl.startsWith('https') ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      headers,
    };
    proto.get(opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        return downloadFile(res.headers.location, redirectDepth + 1).then(resolve).catch(reject);
      }
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

const MIME_MAP = {
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp',
  mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime', avi: 'video/x-msvideo',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', aac: 'audio/aac',
  m4a: 'audio/mp4', flac: 'audio/flac',
};

function getContentType(filePath) {
  const ext = path.extname(filePath).slice(1).toLowerCase() || 'png';
  return MIME_MAP[ext] || 'application/octet-stream';
}

async function uploadToFal(filePath, falKey) {
  const { readFileSync } = require('fs');
  const fileBuffer = readFileSync(filePath);
  const contentType = getContentType(filePath);
  const fileName = path.basename(filePath);
  const initRes = await fetch('https://rest.alpha.fal.ai/storage/upload/initiate', {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ file_name: fileName, content_type: contentType }),
  });
  if (!initRes.ok) throw new Error(`fal upload initiate failed: ${initRes.status}`);
  const { upload_url, file_url } = await initRes.json();
  const putRes = await fetch(upload_url, {
    method: 'PUT',
    headers: { 'Content-Type': contentType },
    body: fileBuffer,
  });
  if (!putRes.ok) throw new Error(`fal upload PUT failed: ${putRes.status}`);
  console.log(`[agent] uploaded ${fileName} (${contentType}) to fal.ai: ${file_url}`);
  return file_url;
}

async function uploadReferencesToFal(files, falKey) {
  if (!files?.length || !falKey) return [];
  const results = [];
  for (const filePath of files) {
    try {
      const falUrl = await uploadToFal(filePath, falKey);
      results.push(falUrl);
    } catch (e) {
      console.error(`[agent] Failed to upload ${filePath} to fal:`, e.message);
    }
  }
  return results;
}

// ============================================================
// Direct fal.ai queue API for video generation
// Bypasses Claude sub-agent to avoid turn-limit exhaustion
// ============================================================

async function callFalMcpTool(falKey, toolName, args) {
  const mcpBody = JSON.stringify({
    jsonrpc: '2.0',
    method: 'tools/call',
    params: { name: toolName, arguments: args },
    id: 1,
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    const res = await fetch('https://mcp.fal.ai/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Authorization': `Key ${falKey}`,
      },
      body: mcpBody,
      signal: controller.signal,
    });
    const text = await res.text();
    const dataMatch = text.match(/^data: (.+)$/m);
    let data;
    if (dataMatch) {
      data = JSON.parse(dataMatch[1]);
    } else {
      data = JSON.parse(text);
    }
    if (data.result?.isError) throw new Error(data.result.content?.[0]?.text || `MCP ${toolName} error`);
    return data.result?.content?.[0]?.text || '';
  } finally {
    clearTimeout(timeout);
  }
}

function buildFalInput(body, schemaProps, falUploadedUrls, falMediaUrls) {
  const keys = Object.keys(schemaProps);
  const input = {};

  const findKey = (patterns, fallback) => {
    for (const p of patterns) {
      const found = keys.find(k => p.test(k));
      if (found) return found;
    }
    return fallback;
  };

  const promptKey = findKey([/^prompt$/i, /^text_prompt$/i], 'prompt');
  if (body.instruction) input[promptKey] = body.instruction;

  const srcImg = falMediaUrls?.sourceImage;
  if (srcImg) {
    const imgKey = findKey([
      /^image_url$/i, /^start_image_url$/i, /^input_image_url$/i,
      /^input_image$/i, /^source_image_url$/i,
    ], 'image_url');
    input[imgKey] = srcImg;
  } else if (falUploadedUrls?.length > 0) {
    const imgKey = findKey([
      /^image_url$/i, /^start_image_url$/i, /^input_image_url$/i,
    ], 'image_url');
    input[imgKey] = falUploadedUrls[0];
  }

  const srcVid = falMediaUrls?.sourceVideo;
  if (srcVid) {
    const vidKey = findKey([
      /^video_url$/i, /^source_video_url$/i, /^input_video_url$/i,
      /^motion_video_url$/i, /^reference_video_url$/i, /^input_video$/i,
      /^motion_brush_url$/i, /^ref.*video/i, /video_url$/i,
    ], 'video_url');
    input[vidKey] = srcVid;
  }

  const audUrl = falMediaUrls?.audioUrl;
  if (audUrl) {
    const audKey = findKey([
      /^audio_url$/i, /^audio$/i, /^input_audio_url$/i, /^input_audio$/i,
    ], 'audio_url');
    input[audKey] = audUrl;
  }

  const endImg = falMediaUrls?.endImage;
  if (endImg) {
    const endKey = findKey([
      /^end_image_url$/i, /^tail_image_url$/i, /^end_frame_url$/i,
      /^last_frame_url$/i,
    ], 'end_image_url');
    input[endKey] = endImg;
  }

  if (body.duration != null) {
    const durKey = findKey([/^duration$/i], 'duration');
    const durProp = schemaProps[durKey];
    if (durProp?.type === 'string' || durProp?.enum) {
      input[durKey] = String(body.duration);
    } else {
      input[durKey] = Number(body.duration);
    }
  }

  if (body.aspectRatio) {
    const arKey = findKey([/^aspect_ratio$/i, /^video_aspect_ratio$/i], 'aspect_ratio');
    input[arKey] = body.aspectRatio;
  }

  if (body.fps) {
    const fpsKey = findKey([/^fps$/i, /^frame_rate$/i], null);
    if (fpsKey) input[fpsKey] = Number(body.fps);
  }

  for (const [key, prop] of Object.entries(schemaProps)) {
    if (prop.required && input[key] == null) {
      if (prop.enum?.length > 0) {
        input[key] = prop.enum[prop.enum.includes('video') ? prop.enum.indexOf('video') : 0];
      } else if (prop.default != null) {
        input[key] = prop.default;
      }
    }
  }

  return input;
}

async function directFalGenerate(modelId, body, falKey, falUploadedUrls, falMediaUrls) {
  let schemaProps = {};
  try {
    console.log(`[agent] directFal: fetching schema for ${modelId}`);
    const schemaText = await callFalMcpTool(falKey, 'get_model_schema', { endpoint_id: modelId });
    const schema = JSON.parse(schemaText);
    if (Array.isArray(schema?.input_params)) {
      for (const param of schema.input_params) {
        schemaProps[param.name] = {
          type: (param.type || 'string').replace(/ \| null/g, ''),
          required: !!param.required,
          enum: param.enum,
          description: param.description || '',
          default: param.default,
        };
      }
    } else {
      schemaProps = schema?.input_schema?.properties
        || schema?.input?.properties
        || schema?.properties || {};
    }
    console.log(`[agent] directFal: schema keys: ${Object.keys(schemaProps).join(', ')}`);
  } catch (e) {
    console.warn(`[agent] directFal: schema fetch failed (${e.message}), using defaults`);
  }

  const input = buildFalInput(body, schemaProps, falUploadedUrls, falMediaUrls);
  console.log(`[agent] directFal: submitting to ${modelId}, input keys: ${Object.keys(input).join(', ')}`);

  const submitRes = await fetch(`https://queue.fal.run/${modelId}`, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  if (!submitRes.ok) {
    const errBody = await submitRes.text();
    throw new Error(`fal.ai submit failed (${submitRes.status}): ${errBody.slice(0, 500)}`);
  }

  const submitData = await submitRes.json();
  const requestId = submitData.request_id;
  if (!requestId) throw new Error(`No request_id from fal.ai: ${JSON.stringify(submitData).slice(0, 300)}`);

  const statusUrl = submitData.status_url || `https://queue.fal.run/${modelId}/requests/${requestId}/status`;
  const responseUrl = submitData.response_url || `https://queue.fal.run/${modelId}/requests/${requestId}`;
  console.log(`[agent] directFal: queued, request_id=${requestId}, statusUrl=${statusUrl}`);

  const MAX_WAIT = 10 * 60 * 1000;
  const start = Date.now();
  let pollMs = 5000;

  while (true) {
    await new Promise(r => setTimeout(r, pollMs));

    if (Date.now() - start > MAX_WAIT) {
      throw new Error(`fal.ai job timed out after ${Math.round(MAX_WAIT / 60000)} minutes`);
    }

    try {
      const statusRes = await fetch(statusUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Key ${falKey}`,
          'Content-Type': 'application/json',
        },
        body: '{}',
      });

      if (!statusRes.ok) {
        console.warn(`[agent] directFal: status HTTP ${statusRes.status}, retrying...`);
        continue;
      }

      const statusData = await statusRes.json();
      const elapsed = Math.round((Date.now() - start) / 1000);
      console.log(`[agent] directFal: status=${statusData.status}, elapsed=${elapsed}s`);

      if (statusData.status === 'COMPLETED') break;
      if (statusData.status === 'FAILED') {
        throw new Error(`fal.ai generation failed: ${JSON.stringify(statusData).slice(0, 500)}`);
      }
    } catch (e) {
      if (e.message.includes('fal.ai generation failed')) throw e;
      console.warn(`[agent] directFal: poll error (${e.message}), retrying...`);
    }

    if (Date.now() - start > 60000) pollMs = 10000;
  }

  const resultRes = await fetch(responseUrl, {
    method: 'POST',
    headers: {
      'Authorization': `Key ${falKey}`,
      'Content-Type': 'application/json',
    },
    body: '{}',
  });

  if (!resultRes.ok) {
    const errBody = await resultRes.text();
    throw new Error(`fal.ai result fetch failed (${resultRes.status}): ${errBody.slice(0, 500)}`);
  }

  const result = await resultRes.json();
  console.log(`[agent] directFal: result keys: ${Object.keys(result).join(',')}`);

  let videoUrl = result.video?.url || result.output?.url || result.result?.video?.url;
  if (!videoUrl) {
    const json = JSON.stringify(result);
    const m = json.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov)/i);
    if (m) videoUrl = m[0];
  }

  if (!videoUrl) {
    console.error('[agent] directFal: no video URL in result:', JSON.stringify(result).slice(0, 1000));
    throw new Error('Generation completed but no video URL in response');
  }

  console.log(`[agent] directFal: video URL: ${videoUrl.slice(0, 100)}`);

  return {
    video: { url: videoUrl },
    prompt: body.instruction,
    model: modelId,
    modelLabel: body.modelLabel || modelId.split('/').pop(),
    cost: result.cost || undefined,
  };
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

function buildPrompt(body, imageFiles, falUploadedUrls, falMediaUrls) {
  const { type, instruction, model, size, duration, aspectRatio } = body;
  const references = [...(body.references || []), ...(body.referenceImages || [])];
  const parts = [];
  if (falUploadedUrls?.length) {
    const refList = falUploadedUrls.map((url, i) => `  ${i + 1}. ${url}`).join('\n');
    parts.push(`Reference images already uploaded to fal.ai CDN (${falUploadedUrls.length} total, ordered):\n${refList}\nThese URLs are ready to use — pass them directly to the model as image parameters.`);
  } else if (references?.length) {
    const refList = references.map((url, i) => `  ${i + 1}. ${url}`).join('\n');
    parts.push(`Reference images (${references.length} total, ordered):\n${refList}\nThe model will receive these images as inputs.`);
  }
  if (imageFiles?.length && !falUploadedUrls?.length) {
    parts.push(`\nIMPORTANT: Use the Read tool to view each reference image file below. Analyze what you see and use it to craft an accurate prompt.`);
    imageFiles.forEach((f, i) => {
      parts.push(`Reference image ${i + 1} file: ${f}`);
    });
  }
  if (model && model !== 'auto') {
    parts.push(`Use model: ${model}`);
  }
  if (type === 'video') {
    if (duration) parts.push(`Duration: ${duration} seconds`);
    if (body.aspectRatio) parts.push(`Aspect ratio: ${body.aspectRatio}`);
    if (body.quality) parts.push(`Quality: ${body.quality}`);
    if (body.fps) parts.push(`FPS: ${body.fps} frames per second`);
    if (body.strategy) parts.push(`Strategy: ${body.strategy}`);
    if (body.sourceImage) {
      const url = falMediaUrls?.sourceImage || body.sourceImage;
      parts.push(`Source image (uploaded to fal.ai CDN): ${url}`);
    }
    if (body.sourceVideo) {
      const url = falMediaUrls?.sourceVideo || body.sourceVideo;
      parts.push(`Source video (uploaded to fal.ai CDN): ${url}`);
    }
    if (body.audioUrl) {
      const url = falMediaUrls?.audioUrl || body.audioUrl;
      parts.push(`Audio (uploaded to fal.ai CDN): ${url}`);
    }
    if (body.endImage) {
      const url = falMediaUrls?.endImage || body.endImage;
      parts.push(`End image (uploaded to fal.ai CDN): ${url}`);
    }
  } else {
    if (size) parts.push(`Image size: ${size}`);
    if (aspectRatio) parts.push(`Aspect ratio: ${aspectRatio}`);
  }
  parts.push(`\nUser instruction:\n${instruction}`);
  return parts.join('\n');
}

function callClaude(token, mcpConfig, systemPrompt, userPrompt, tools, maxTurns, model) {
  return new Promise((resolve, reject) => {
    const useModel = model || 'sonnet';
    const args = [
      '--print', '--output-format', 'json',
      '--max-turns', String(maxTurns || 15),
      '--model', useModel,
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
      if (stderr) console.log(`[agent] claude stderr (${useModel}):`, stderr.slice(0, 500));
      if (err && !stdout) return reject(new Error(stderr || err.message));
      try {
        const parsed = JSON.parse(stdout);
        const text = parsed.result || '';
        if (!text) {
          console.log(`[agent] empty result from ${useModel}, stdout len:`, stdout.length, 'cost:', parsed.cost_usd);
          const dumpFile = path.join(TMP_DIR, `debug-${Date.now()}.json`);
          writeFileSync(dumpFile, stdout);
          console.log(`[agent] full output dumped to ${dumpFile}`);
        }
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

const pricingCache = new Map();
const PRICING_TTL = 5 * 60 * 1000;

let activeRequests = 0;

const server = http.createServer(async (req, res) => {
  res.setHeader('Content-Type', 'application/json');

  if (req.method === 'GET' && req.url === '/health') {
    res.end(JSON.stringify({ ok: true, version: '1.8.5', activeRequests }));
    return;
  }

  if (req.method === 'GET' && req.url === '/status') {
    res.end(JSON.stringify({ ok: true, version: '1.8.5', activeRequests, uptime: process.uptime() }));
    return;
  }

  const isPrepare = req.method === 'POST' && req.url.startsWith('/prepare');
  const isGenerate = req.method === 'POST' && req.url.startsWith('/generate');
  const isPricing = req.method === 'POST' && req.url === '/pricing';

  if (!isPrepare && !isGenerate && !isPricing) {
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

  activeRequests++;

  let body;
  try { body = await parseBody(req); }
  catch (e) { activeRequests--; res.statusCode = 400; res.end(JSON.stringify({ error: e.message })); return; }

  // --- Pricing endpoint ---
  if (isPricing) {
    const falKey = req.headers['x-fal-key'] || body.falKey;
    const { modelId } = body;
    if (!falKey) { activeRequests--; res.statusCode = 400; res.end(JSON.stringify({ error: 'falKey required' })); return; }
    if (!modelId) { activeRequests--; res.statusCode = 400; res.end(JSON.stringify({ error: 'modelId required' })); return; }

    const cached = pricingCache.get(modelId);
    if (cached && Date.now() - cached.ts < PRICING_TTL) {
      activeRequests--;
      res.end(JSON.stringify({ ok: true, cached: true, ...cached.data }));
      return;
    }

    try {
      console.log(`[agent] pricing lookup for ${modelId} (direct MCP)`);
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
          'Authorization': `Key ${falKey}`,
        },
        body: mcpBody,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      const mcpText = await mcpRes.text();
      const dataMatch = mcpText.match(/^data: (.+)$/m);
      let mcpData;
      if (dataMatch) {
        mcpData = JSON.parse(dataMatch[1]);
      } else {
        mcpData = JSON.parse(mcpText);
      }
      if (mcpData.result?.isError) throw new Error(mcpData.result.content?.[0]?.text || 'MCP error');
      const pricingText = mcpData.result?.content?.[0]?.text;
      if (!pricingText) throw new Error('Empty pricing response');
      const pricing = JSON.parse(pricingText);
      const price = pricing.prices?.[0];
      if (!price) throw new Error('No price data');
      const result = {
        amount: price.unit_price,
        currency: price.currency || 'USD',
        details: price.unit ? `per ${price.unit}` : '',
      };
      pricingCache.set(modelId, { ts: Date.now(), data: result });
      console.log(`[agent] pricing result for ${modelId}: $${result.amount}/${price.unit || 'run'}`);
      res.end(JSON.stringify({ ok: true, ...result }));
    } catch (e) {
      console.error(`[agent] pricing error for ${modelId}:`, e.message);
      res.statusCode = 500;
      res.end(JSON.stringify({ error: e.message }));
    }
    activeRequests--;
    return;
  }

  // --- Prepare / Generate endpoints ---
  const falKey = req.headers['x-fal-key'] || body.falKey;
  const { type = 'image', instruction } = body;
  if (!falKey) { activeRequests--; res.statusCode = 400; res.end(JSON.stringify({ error: 'falKey required' })); return; }
  const hasMedia = body.sourceImage || body.sourceVideo || body.audioUrl || body.references?.length || body.referenceImages?.length;
  if (!instruction && !hasMedia) { activeRequests--; res.statusCode = 400; res.end(JSON.stringify({ error: 'instruction or media reference required' })); return; }

  const id = randomUUID();
  const mcpConfig = path.join(TMP_DIR, `mcp-${id}.json`);
  let allDownloaded = [];

  try {
    // Download and upload all references + media to fal CDN
    const otherRefs = [...(body.references || []), ...(body.referenceImages || [])];
    const imageFiles = await downloadReferences(otherRefs);
    allDownloaded.push(...imageFiles);

    let falUploadedUrls = [];
    const falMediaUrls = {};

    if (isGenerate && falKey) {
      // Upload other image references
      if (imageFiles.length > 0) {
        falUploadedUrls = await uploadReferencesToFal(imageFiles, falKey);
        console.log(`[agent] uploaded ${falUploadedUrls.length}/${imageFiles.length} image refs to fal.ai`);
      }

      // Upload sourceImage separately for reliable mapping
      if (body.sourceImage) {
        try {
          const srcFile = await downloadFile(body.sourceImage);
          allDownloaded.push(srcFile);
          falMediaUrls.sourceImage = await uploadToFal(srcFile, falKey);
          console.log(`[agent] uploaded sourceImage to fal.ai: ${falMediaUrls.sourceImage}`);
        } catch (e) {
          console.error(`[agent] Failed to upload sourceImage:`, e.message);
        }
      }

      // Upload sourceVideo if present
      if (body.sourceVideo) {
        try {
          const videoFile = await downloadFile(body.sourceVideo);
          allDownloaded.push(videoFile);
          falMediaUrls.sourceVideo = await uploadToFal(videoFile, falKey);
          console.log(`[agent] uploaded sourceVideo to fal.ai: ${falMediaUrls.sourceVideo}`);
        } catch (e) {
          console.error(`[agent] Failed to upload sourceVideo:`, e.message);
        }
      }

      // Upload audioUrl if present
      if (body.audioUrl) {
        try {
          const audioFile = await downloadFile(body.audioUrl);
          allDownloaded.push(audioFile);
          falMediaUrls.audioUrl = await uploadToFal(audioFile, falKey);
          console.log(`[agent] uploaded audioUrl to fal.ai: ${falMediaUrls.audioUrl}`);
        } catch (e) {
          console.error(`[agent] Failed to upload audioUrl:`, e.message);
        }
      }

      // Upload endImage if present
      if (body.endImage) {
        try {
          const endFile = await downloadFile(body.endImage);
          allDownloaded.push(endFile);
          falMediaUrls.endImage = await uploadToFal(endFile, falKey);
          console.log(`[agent] uploaded endImage to fal.ai: ${falMediaUrls.endImage}`);
        } catch (e) {
          console.error(`[agent] Failed to upload endImage:`, e.message);
        }
      }
    }

    let result;
    const videoModel = body.model || body.modelPref;

    if (isGenerate && type === 'video' && videoModel && videoModel !== 'auto') {
      // Direct fal.ai queue API — no Claude turns wasted on polling
      console.log(`[agent] video generate started (${id}) via DIRECT API, model: ${videoModel}, refs: ${imageFiles.length}, media: ${JSON.stringify(Object.keys(falMediaUrls))}`);
      result = await directFalGenerate(videoModel, body, falKey, falUploadedUrls, falMediaUrls);
      console.log(`[agent] video generate complete (${id}) via direct API`);
    } else {
      // Claude sub-agent for prepare, image generate, or auto-model video
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

      const userPrompt = buildPrompt(body, imageFiles, falUploadedUrls, falMediaUrls);
      const action = isPrepare ? 'prepare' : 'generate';
      const claudeModel = 'sonnet';
      console.log(`[agent] ${type} ${action} started (${id}), model: ${body.model || 'auto'}, refs: ${imageFiles.length}, media: ${JSON.stringify(Object.keys(falMediaUrls))}, claude: ${claudeModel}`);

      const maxTurns = 15;
      result = await callClaude(claudeToken, mcpConfig, systemPrompt, userPrompt, tools, maxTurns, claudeModel);
      console.log(`[agent] ${type} ${action} complete (${id}), raw keys: ${Object.keys(result).join(',')}`);

      if (isGenerate && type === 'image') {
        result = normalizeGenerateResult(result);
        const imgCount = result.images?.length || 0;
        console.log(`[agent] normalized: ${imgCount} images`);
        if (imgCount === 0) {
          console.error(`[agent] WARNING: no images after normalization (${id}), result:`, JSON.stringify(result).slice(0, 500));
        }
      }
    }

    res.end(JSON.stringify({ ok: true, ...result }));
  } catch (e) {
    console.error(`[agent] error (${id}):`, e.message);
    res.statusCode = 500;
    res.end(JSON.stringify({ error: e.message }));
  } finally {
    activeRequests--;
    try { unlinkSync(mcpConfig); } catch {}
    for (const f of allDownloaded) { try { unlinkSync(f); } catch {} }
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[agent] Avatar Studio agent wrapper v1.8.5 listening on :${PORT}`);
});
