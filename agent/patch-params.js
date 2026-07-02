const fs = require('fs');
const file = '/srv/workspaces/system/avatar-studio/agent/server.js';
let code = fs.readFileSync(file, 'utf8');

// 1. Update the video prepare return format to include params
const oldReturn = `Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation: why this model (mention strategy influence), what aspect ratio/quality/fps will be used",
  "estimatedCost": { "amount": 0.10, "currency": "USD", "details": "per video" }
}`;

const newReturn = `Return ONLY a JSON object:
{
  "prompt": "the crafted prompt",
  "model": "fal-ai/model-id",
  "modelLabel": "Model Name",
  "reasoning": "brief explanation: why this model (mention strategy influence), what aspect ratio/quality/fps will be used",
  "estimatedCost": { "amount": 0.10, "currency": "USD", "details": "per video" },
  "params": { "aspectRatio": "9:16", "quality": "1k", "fps": 24, "duration": 5 }
}

The params object MUST contain the actual values you decided to use for this generation (not the user's original input if you changed them). For quality: use "sd" for 480p, "1k" for 720p/1080p, "4k" for 4K.`;

if (!code.includes(oldReturn)) {
  console.error('Could not find old return format');
  process.exit(1);
}

code = code.replace(oldReturn, newReturn);

fs.writeFileSync(file, code);
console.log('Video prepare return format patched successfully');
