import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';
import { getSession, updateSessionKeys } from '@/lib/sessions';

export async function PATCH(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const payload = await verifyToken(sessionCookie);
  if (!payload || typeof payload.sessionId !== 'string') {
    return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  }

  const session = getSession(payload.sessionId as string);
  if (!session) {
    return NextResponse.json({ error: 'Session expired' }, { status: 401 });
  }

  const body = await request.json();
  const { falKey, anthropicKey } = body as { falKey?: string; anthropicKey?: string };

  updateSessionKeys(payload.sessionId as string, falKey, anthropicKey);

  const updated = getSession(payload.sessionId as string);
  return NextResponse.json({
    hasFalKey: !!(updated?.falKey || process.env.FAL_KEY),
    hasAnthropicKey: !!(updated?.anthropicKey || process.env.ANTHROPIC_API_KEY),
  });
}
