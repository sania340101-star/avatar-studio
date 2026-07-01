import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const userId = req.headers.get('x-user-id');
    if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const sessionId = req.headers.get('x-session-id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const session = getSession(sessionId);
    const falKey = session?.falKey || process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured. Launch from Agent Factory or add key in Settings.' }, { status: 400 });
    }

    const body = await req.json();
    const { instruction } = body;

    if (!instruction?.trim()) {
      return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });
    }

    const agentBody = { ...body, falKey };

    const agentRes = await fetch(`${AGENT_URL}/prepare`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify(agentBody),
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
