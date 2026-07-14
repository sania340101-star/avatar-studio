import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';
import { getSession } from '@/lib/sessions';

export async function GET(request: NextRequest) {
  const sessionCookie = request.cookies.get('session')?.value;
  if (!sessionCookie) {
    return NextResponse.json({ user: null });
  }

  const payload = await verifyToken(sessionCookie);
  if (!payload || typeof payload.sessionId !== 'string') {
    return NextResponse.json({ user: null });
  }

  const session = getSession(payload.sessionId as string);
  if (!session) {
    return NextResponse.json({ user: null });
  }

  let userName = '';
  let email = '';
  let authMethod: 'sso' | 'otp' = 'otp';
  try {
    const userInfo = request.cookies.get('user-info')?.value;
    if (userInfo) {
      const info = JSON.parse(decodeURIComponent(userInfo));
      userName = info.userName || '';
      email = info.email || '';
      if (info.authMethod === 'sso') authMethod = 'sso';
    }
  } catch { /* ignore */ }

  const isSso = authMethod === 'sso';
  return NextResponse.json({
    user: {
      userId: session.userId ?? (payload.userId as string) ?? 'unknown',
      userName,
      email,
      role: payload.role ?? 'user',
      authMethod,
      hasFalKey: !!(session.falKey || (isSso && process.env.FAL_KEY)),
      hasAnthropicKey: !!(session.anthropicKey || (isSso && process.env.ANTHROPIC_API_KEY)),
    },
  });
}
