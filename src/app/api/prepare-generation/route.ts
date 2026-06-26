import { NextRequest, NextResponse } from 'next/server';

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages';

interface PrepareRequest {
  instruction: string;
  referenceDescriptions: string[];
  modelPreference: string; // 'auto' | 'group:flux' | specific model id
  desiredParams: {
    size: string;
    resolution: string;
    count: number;
  };
  availableModels: { id: string; label: string; format: string; group: string }[];
  anthropicKey: string;
}

const SYSTEM_PROMPT = `You are an image generation assistant for Avatar Studio (HYPERVSN).

Your job: take the user's instruction and references, then produce the optimal prompt and parameters for fal.ai image generation.

You receive:
- User instruction (what they want, in natural language)
- References (numbered list of uploaded images/files)
- Model preference (auto, a group, or a specific model)
- Desired parameters (size, resolution, count)
- Available models with their capabilities

You must output valid JSON with these fields:
{
  "prompt": "detailed prompt for fal.ai model",
  "selectedModel": "fal-ai/model-id",
  "selectedModelLabel": "Model Name",
  "params": {
    "size": "portrait_16_9",
    "resolution": "1k",
    "count": 4
  },
  "reasoning": "brief explanation of your choices",
  "paramNotes": ["size: changed from 4k to 2k because model X doesn't support 4k"]
}

Rules:
1. Write the prompt in English, optimized for the selected model
2. The prompt should be detailed and specific — describe exactly what the image should look like
3. If user references images by number ("image 1", "first image", "картинка 1"), use "the first reference image", "the second reference image" etc. in the prompt
4. If model preference is "auto" — pick the best model for the task from available models
5. If model preference is a group (e.g. "group:flux") — pick the best model from that group
6. If model preference is a specific model — use it, but note if it's not ideal
7. If desired parameters don't match what the model supports, adjust and explain in paramNotes
8. For HYPERVSN content: prefer black backgrounds, 3D look, clean studio lighting
9. Output ONLY valid JSON, no markdown, no explanation outside the JSON`;

export async function POST(req: NextRequest) {
  try {
    const body: PrepareRequest = await req.json();
    const { instruction, referenceDescriptions, modelPreference, desiredParams, availableModels, anthropicKey } = body;

    if (!anthropicKey) {
      return NextResponse.json({ error: 'Anthropic API key required. Add it in Settings.' }, { status: 400 });
    }

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const refsText = referenceDescriptions.length > 0
      ? `References:\n${referenceDescriptions.map((d, i) => `${i + 1}. ${d}`).join('\n')}`
      : 'No references uploaded.';

    const modelsText = availableModels.map(m => `- ${m.id} (${m.label}, format: ${m.format}, group: ${m.group})`).join('\n');

    const userMessage = `${refsText}

Model preference: ${modelPreference === 'auto' ? 'Auto — pick the best model' : modelPreference.startsWith('group:') ? `Group: ${modelPreference.replace('group:', '')} — pick best from this group` : `Specific: ${modelPreference}`}

Desired parameters:
- Size: ${desiredParams.size}
- Resolution: ${desiredParams.resolution}
- Count: ${desiredParams.count}

Available models:
${modelsText}

User instruction:
${instruction}`;

    const response = await fetch(ANTHROPIC_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Anthropic API error: ${err}`);
    }

    const data = await response.json();
    const text = data.content?.[0]?.text;
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
