import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/sessions';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

export async function POST(req: NextRequest) {
  try {
    const sessionId = req.headers.get('x-session-id');
    if (!sessionId) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const session = getSession(sessionId);
    const falKey = session?.falKey || process.env.FAL_KEY;
    if (!falKey) {
      return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });
    }

    const { modelId } = await req.json();

    if (!modelId) {
      return NextResponse.json({ error: 'modelId required' }, { status: 400 });
    }

    const agentRes = await fetch(`${AGENT_URL}/pricing`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Service-Key': SERVICE_KEY,
      },
      body: JSON.stringify({ modelId, falKey }),
    });

    const data = await agentRes.json();

    if (!agentRes.ok || data.error) {
      return NextResponse.json({ error: data.error || 'Pricing unavailable' }, { status: 502 });
    }

    return NextResponse.json({
      amount: data.amount ?? null,
      currency: data.currency ?? 'USD',
      details: data.details ?? '',
    });
  } catch {
    return NextResponse.json({ error: 'Pricing service unavailable' }, { status: 502 });
  }
}
