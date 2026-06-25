import { NextRequest, NextResponse } from 'next/server';

const FAL_QUEUE_URL = 'https://queue.fal.run';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, model, prompt, size, count = 1, references, falKey } = body;

    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured. Launch from Agent Factory or add key in Settings.' }, { status: 400 });
    }

    if (!model || !prompt) {
      return NextResponse.json({ error: 'Model and prompt are required.' }, { status: 400 });
    }

    if (type === 'image') {
      return await generateImages(model, prompt, size, count, references, falKey, body.format, body.aspectRatio);
    } else if (type === 'video') {
      return await generateVideo(model, prompt, body, falKey);
    }

    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function generateImages(
  model: string,
  prompt: string,
  size: string,
  count: number,
  references: string[] | undefined,
  falKey: string,
  format?: string,
  aspectRatio?: string,
) {
  const input: Record<string, unknown> = {
    prompt,
    num_images: count,
  };

  if (format === 'aspect_ratio' && aspectRatio) {
    input.aspect_ratio = aspectRatio;
  } else if (model.includes('recraft')) {
    input.size = size === 'portrait_16_9' ? '1024x1820' : size === 'square' ? '1024x1024' : '1820x1024';
  } else {
    input.image_size = size;
  }

  if (references?.length) {
    if (model.includes('kontext') || model.includes('edit') || model.includes('image-to-image')) {
      input.image_url = references[0];
    }
  }

  const submitRes = await fetch(`${FAL_QUEUE_URL}/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${falKey}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`fal.ai error: ${err}`);
  }

  const { request_id, status: initialStatus } = await submitRes.json();

  if (initialStatus === 'COMPLETED') {
    const resultRes = await fetch(`${FAL_QUEUE_URL}/${model}/requests/${request_id}`, {
      headers: { 'Authorization': `Key ${falKey}` },
    });
    const result = await resultRes.json();
    return NextResponse.json({ images: extractImages(result) });
  }

  const result = await pollForResult(model, request_id, falKey);
  return NextResponse.json({ images: extractImages(result) });
}

async function generateVideo(
  model: string,
  prompt: string,
  body: Record<string, unknown>,
  falKey: string
) {
  const input: Record<string, unknown> = { prompt };

  if (body.sourceImage) input.image_url = body.sourceImage;
  if (body.duration) input.duration = body.duration;
  if (body.aspectRatio) input.aspect_ratio = body.aspectRatio;

  const submitRes = await fetch(`${FAL_QUEUE_URL}/${model}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Key ${falKey}`,
    },
    body: JSON.stringify({ input }),
  });

  if (!submitRes.ok) {
    const err = await submitRes.text();
    throw new Error(`fal.ai error: ${err}`);
  }

  const { request_id } = await submitRes.json();
  const result = await pollForResult(model, request_id, falKey, 300000);

  const videoUrl = (result.video as Record<string, unknown>)?.url
    || (result.output as Record<string, unknown>)?.url
    || result.url;
  if (!videoUrl) throw new Error('No video URL in response');

  return NextResponse.json({ video: { url: videoUrl } });
}

async function pollForResult(model: string, requestId: string, falKey: string, timeout = 120000): Promise<Record<string, unknown>> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    await new Promise(r => setTimeout(r, 2000));

    const statusRes = await fetch(`${FAL_QUEUE_URL}/${model}/requests/${requestId}/status`, {
      headers: { 'Authorization': `Key ${falKey}` },
    });
    const status = await statusRes.json();

    if (status.status === 'COMPLETED') {
      const resultRes = await fetch(`${FAL_QUEUE_URL}/${model}/requests/${requestId}`, {
        headers: { 'Authorization': `Key ${falKey}` },
      });
      return await resultRes.json();
    }

    if (status.status === 'FAILED') {
      throw new Error(status.error || 'Generation failed');
    }
  }
  throw new Error('Generation timed out');
}

function extractImages(result: Record<string, unknown>): { url: string; seed?: number }[] {
  const images = (result.images || result.output || []) as Array<{ url: string; seed?: number }>;
  if (Array.isArray(images)) {
    return images.map(img => ({
      url: typeof img === 'string' ? img : img.url,
      seed: typeof img === 'object' ? img.seed : undefined,
    }));
  }
  if (result.image && typeof result.image === 'object' && 'url' in (result.image as Record<string, unknown>)) {
    return [{ url: (result.image as { url: string }).url }];
  }
  return [];
}
