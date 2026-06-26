import { NextRequest, NextResponse } from 'next/server';

interface PrepareRequest {
  type?: 'image' | 'video';
  instruction: string;
  referenceDescriptions: string[];
  modelPreference: string; // 'auto' | 'group:flux' | specific model id
  desiredParams: {
    // Image params
    size?: string;
    resolution?: string;
    // Video params
    duration?: number;
    typeFilter?: string;
  };
  availableModels: { id: string; label: string; [key: string]: unknown }[];
  anthropicKey: string;
}

const IMAGE_SYSTEM_PROMPT = `You are an image generation assistant for Avatar Studio (HYPERVSN).

Your job: take the user's instruction and references, then produce the optimal prompt and parameters for fal.ai image generation.

You receive:
- User instruction (what they want, in natural language)
- References (numbered list of uploaded images/files)
- Model preference (auto, a group, or a specific model)
- Desired parameters (size, resolution)
- Available models with their capabilities

You must output valid JSON with these fields:
{
  "prompt": "detailed prompt for fal.ai model",
  "selectedModel": "fal-ai/model-id",
  "selectedModelLabel": "Model Name",
  "params": {
    "size": "portrait_16_9",
    "resolution": "1k"
  },
  "reasoning": "brief explanation of your choices",
  "paramNotes": ["size: changed from 4k to 2k because model X doesn't support 4k"]
}

Rules:
1. Write the prompt in English, optimized for the selected model
2. The prompt should be detailed and specific — describe exactly what the image should look like
3. If user references images by number ("image 1", "first image", "kartinka 1"), use "the first reference image", "the second reference image" etc. in the prompt
4. If model preference is "auto" — pick the best model for the task from available models
5. If model preference is a group (e.g. "group:flux") — pick the best model from that group
6. If model preference is a specific model — use it, but note if it's not ideal
7. If desired parameters don't match what the model supports, adjust and explain in paramNotes
8. For HYPERVSN content: prefer black backgrounds, 3D look, clean studio lighting
9. Output ONLY valid JSON, no markdown, no explanation outside the JSON`;

const VIDEO_SYSTEM_PROMPT = `You are a video generation assistant for Avatar Studio (HYPERVSN).
Your job: take the user's instruction and references, then produce the optimal prompt and parameters for fal.ai video generation.

You receive:
- User instruction (what they want, in natural language)
- References (images, videos, audio files uploaded by the user)
- Model preference (auto, a group, or a specific model)
- Desired parameters (duration, video type filter)
- Available models with their capabilities (avatar, lip-sync, motion-control, etc.)

You must output valid JSON with these fields:
{
  "prompt": "detailed prompt for video generation",
  "selectedModel": "fal-ai/model-id",
  "selectedModelLabel": "Model Name",
  "params": { "duration": 5 },
  "reasoning": "explanation of choices",
  "paramNotes": ["duration: adjusted from 10s to 5s because model supports max 6s"]
}

Rules:
1. Write clear, specific prompts describing the desired motion/animation
2. Match model to task: avatar models for talking heads, motion-control for motion transfer, lip-sync for audio-driven, etc.
3. Consider reference types: if audio provided, pick an avatar/lip-sync model. If source video provided, pick video-edit or lip-sync model.
4. Adjust duration to model capabilities (most models support 5-10s, some up to 20s)
5. For HYPERVSN avatars: clean motion, professional look, no artifacts
6. If model preference is "auto" — pick the best model for the task from available models
7. If model preference is a group — pick the best model from that group
8. If model preference is a specific model — use it, but note if it's not ideal
9. Output ONLY valid JSON, no markdown, no explanation outside the JSON`;

const AF_URL = process.env.AF_INTERNAL_URL || 'http://172.18.32.73:3380';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body: PrepareRequest = await req.json();
    const { type = 'image', instruction, referenceDescriptions, modelPreference, desiredParams, availableModels } = body;

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const refsText = referenceDescriptions.length > 0
      ? `References:\n${referenceDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
      : 'No references uploaded.';

    const isVideo = type === 'video';

    const modelsText = availableModels.map(m => {
      if (isVideo) {
        const caps = (m.capabilities as string[]) || [];
        return `- ${m.id} (${m.label}, type: ${m.type || 'unknown'}, group: ${m.group || 'other'}, capabilities: ${caps.join(', ') || 'image-to-video'})`;
      }
      return `- ${m.id} (${m.label}, format: ${m.format || 'unknown'}, group: ${m.group || 'other'})`;
    }).join('\n');

    let paramsText: string;
    if (isVideo) {
      paramsText = `- Duration: ${desiredParams.duration || 5} seconds
- Type filter: ${desiredParams.typeFilter || 'all'}`;
    } else {
      paramsText = `- Size: ${desiredParams.size}
- Resolution: ${desiredParams.resolution}`;
    }

    const userMessage = `${refsText}

Model preference: ${modelPreference === 'auto' ? 'Auto — pick the best model' : modelPreference.startsWith('group:') ? `Group: ${modelPreference.replace('group:', '')} — pick best from this group` : `Specific: ${modelPreference}`}

Desired parameters:
${paramsText}

Available models:
${modelsText}

User instruction:
${instruction}`;

    const llmRes = await fetch(`${AF_URL}/api/internal/llm-query`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify({
        system: isVideo ? VIDEO_SYSTEM_PROMPT : IMAGE_SYSTEM_PROMPT,
        prompt: userMessage,
      }),
    });

    const llmData = await llmRes.json() as { ok?: boolean; text?: string; error?: string };
    if (!llmRes.ok || !llmData.ok) {
      throw new Error(llmData.error || 'LLM query failed');
    }

    const text = llmData.text || '';
    if (!text) throw new Error('Empty response from agent');

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('Agent did not return valid JSON');

    const result = JSON.parse(jsonMatch[0]);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to prepare generation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
