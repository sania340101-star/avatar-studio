import { NextRequest, NextResponse } from 'next/server';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { falKey, instruction } = body;

    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });
    }

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const agentRes = await fetch(`${AGENT_URL}/prepare`, {
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

    return NextResponse.json(data);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Failed to prepare generation';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
