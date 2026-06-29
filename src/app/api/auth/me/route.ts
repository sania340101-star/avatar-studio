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
  if (!session && !process.env.FAL_KEY) {
    return NextResponse.json({ user: null });
  }

  let userName = '';
  let email = '';
  try {
    const userInfo = request.cookies.get('user-info')?.value;
    if (userInfo) {
      const info = JSON.parse(decodeURIComponent(userInfo));
      userName = info.userName || '';
      email = info.email || '';
    }
  } catch { /* ignore */ }

  return NextResponse.json({
    user: {
      userId: session?.userId ?? (payload.userId as string) ?? 'unknown',
      userName,
      email,
      role: payload.role ?? 'user',
      authMethod: 'otp',
      hasFalKey: !!(session?.falKey || process.env.FAL_KEY),
    },
  });
}
