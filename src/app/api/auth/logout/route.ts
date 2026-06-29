import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';
import { deleteSession } from '@/lib/sessions';
import { audit } from '@/lib/audit';
export async function POST(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';
  const sessionCookie = request.cookies.get('session')?.value;
  if (sessionCookie) {
    const payload = await verifyToken(sessionCookie);
    if (payload && typeof payload.sessionId === 'string') {
      audit({ event: 'logout', ip, userId: String(payload.userId), path: '/api/auth/logout' });
      deleteSession(payload.sessionId as string);
    }
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set('session', '', { maxAge: 0, path: '/' });
  response.cookies.set('user-info', '', { maxAge: 0, path: '/' });
  return response;
}
