import { NextRequest, NextResponse } from 'next/server';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, falKey, instruction } = body;

    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured. Launch from Agent Factory or add key in Settings.' }, { status: 400 });
    }

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const agentRes = await fetch(`${AGENT_URL}/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify(body),
    });

    const data = await agentRes.json();

    if (!agentRes.ok || data.error) {
      throw new Error(data.error || `Agent error (${agentRes.status})`);
    }

    if (type === 'video') {
      return NextResponse.json({
        video: data.video,
        prompt: data.prompt,
        model: data.model,
        modelLabel: data.modelLabel,
        reasoning: data.reasoning,
      });
    }

    return NextResponse.json({
      images: data.images || [],
      prompt: data.prompt,
      model: data.model,
      modelLabel: data.modelLabel,
      reasoning: data.reasoning,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
