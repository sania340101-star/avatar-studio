import { NextRequest, NextResponse } from 'next/server';
import { verifyToken } from '@/lib/token';
import { checkRateLimit, getRouteLimit } from '@/lib/rate-limit';
import { audit } from '@/lib/audit';

const PUBLIC_PATHS = new Set([
  '/api/auth/send-otp',
  '/api/auth/verify-otp',
  '/api/auth/sso',
  '/api/auth/me',
  '/api/auth/logout',
]);

const INTERNAL_SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

function getClientIp(request: NextRequest): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function isServiceAuth(request: NextRequest): boolean {
  if (!INTERNAL_SERVICE_KEY) return false;
  const key = request.headers.get('x-service-key');
  return key === INTERNAL_SERVICE_KEY;
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.has(pathname);
  const isService = isServiceAuth(request);
  const ip = getClientIp(request);

  let payload: Record<string, unknown> | null = null;

  if (!isPublic && !isService) {
    const sessionCookie = request.cookies.get('session')?.value;
    if (!sessionCookie) {
      audit({ event: 'auth_failed', ip, path: pathname, detail: 'no session cookie' });
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    payload = await verifyToken(sessionCookie);
    if (!payload) {
      audit({ event: 'auth_failed', ip, path: pathname, detail: 'invalid or expired token' });
      return NextResponse.json({ error: 'Invalid or expired session' }, { status: 401 });
    }
  }

  const rateLimitKey = payload ? String(payload.userId) : ip;
  const { maxRequests, windowMs } = getRouteLimit(pathname);
  const { allowed, retryAfterMs } = checkRateLimit(
    `${rateLimitKey}:${pathname}`,
    maxRequests,
    windowMs,
  );

  if (!allowed) {
    audit({
      event: 'rate_limited',
      ip,
      userId: payload ? String(payload.userId) : undefined,
      path: pathname,
    });
    return NextResponse.json(
      { error: 'Too many requests' },
      {
        status: 429,
        headers: { 'Retry-After': String(Math.ceil(retryAfterMs / 1000)) },
      },
    );
  }

  if (isPublic) {
    return NextResponse.next();
  }

  if (isService) {
    const headers = new Headers(request.headers);
    headers.set('x-user-id', 'service');
    headers.set('x-session-id', 'service');
    headers.set('x-user-role', 'service');
    headers.set('x-client-ip', ip);
    return NextResponse.next({ request: { headers } });
  }

  const headers = new Headers(request.headers);
  headers.set('x-user-id', String(payload!.userId));
  headers.set('x-session-id', String(payload!.sessionId));
  headers.set('x-user-role', String(payload!.role ?? 'user'));
  headers.set('x-client-ip', ip);

  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: '/api/(.*)',
};
