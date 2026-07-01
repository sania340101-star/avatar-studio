import { NextRequest, NextResponse } from 'next/server';
import { checkBudget, recordSpending } from '@/lib/billing';
import { proxyResultUrl } from '@/lib/jobs';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, instruction } = body;
    const falKey = body.falKey || process.env.FAL_KEY;

    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured. Launch from Agent Factory or add key in Settings.' }, { status: 400 });
    }

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const userId = req.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const budget = checkBudget(userId);
    if (!budget.allowed) {
      return NextResponse.json({
        error: `Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}). Try again tomorrow.`,
      }, { status: 429 });
    }

    const agentRes = await fetch(`${AGENT_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify({ ...body, falKey }),
    });

    const data = await agentRes.json();

    if (!agentRes.ok || data.error) {
      throw new Error(data.error || `Agent error (${agentRes.status})`);
    }

    const costUsd = typeof data.cost?.amount === 'number' ? data.cost.amount : 0;
    if (costUsd > 0) {
      recordSpending(userId, costUsd, data.model || '', type || 'image');
    }

    if (type === 'video') {
      const videoUrl = data.video?.url;
      const localVideoUrl = videoUrl ? await proxyResultUrl(videoUrl) : undefined;
      return NextResponse.json({
        video: localVideoUrl ? { url: localVideoUrl } : data.video,
        prompt: data.prompt,
        model: data.model,
        modelLabel: data.modelLabel,
        reasoning: data.reasoning,
        cost: data.cost || undefined,
      });
    }

    const rawImages: { url: string }[] = data.images || [];
    const images = await Promise.all(
      rawImages.map(async (img) => ({ url: await proxyResultUrl(img.url) }))
    );

    return NextResponse.json({
      images,
      prompt: data.prompt,
      model: data.model,
      modelLabel: data.modelLabel,
      reasoning: data.reasoning,
      cost: data.cost || undefined,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
