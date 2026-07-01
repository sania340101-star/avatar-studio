import { NextRequest, NextResponse } from 'next/server';
import { signToken } from '@/lib/token';
import { createSession } from '@/lib/sessions';
import { audit } from '@/lib/audit';

const SSO_JWT_SECRET = process.env.SSO_JWT_SECRET || '';

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

async function verifyJwt(token: string): Promise<Record<string, unknown> | null> {
  if (!SSO_JWT_SECRET) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SSO_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64).buffer as ArrayBuffer,
      enc.encode(`${headerB64}.${payloadB64}`),
    );
    if (!valid) return null;
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get('token');
  if (!token) {
    return NextResponse.json({ error: 'Missing token parameter' }, { status: 400 });
  }

  if (!SSO_JWT_SECRET) {
    console.error('[SSO] SSO_JWT_SECRET not set — rejecting SSO request');
    return NextResponse.json({ error: 'SSO not configured' }, { status: 500 });
  }

  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip') || 'unknown';

  const payload = await verifyJwt(token);
  if (!payload) {
    audit({ event: 'sso_failed', ip, path: '/api/auth/sso', detail: 'invalid or tampered JWT' });
    return NextResponse.json({ error: 'Invalid or tampered SSO token' }, { status: 401 });
  }

  if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) {
    audit({ event: 'sso_failed', ip, path: '/api/auth/sso', detail: 'token expired' });
    return NextResponse.json({ error: 'Token expired' }, { status: 401 });
  }

  const userId = String(payload.userId ?? payload.sub ?? '');
  if (!userId) {
    audit({ event: 'sso_failed', ip, path: '/api/auth/sso', detail: 'missing userId in JWT' });
    return NextResponse.json({ error: 'Invalid SSO token: missing user identity' }, { status: 401 });
  }

  const userName = String(payload.userName ?? payload.name ?? '');
  const role = String(payload.role ?? 'user');
  const serviceKeys = (payload.serviceKeys ?? {}) as Record<string, string>;
  const falKey = serviceKeys.fal_ai_api_key || serviceKeys.fal_ai_access_token || undefined;
  const anthropicKey = serviceKeys.anthropic_api_key || undefined;

  const sessionId = createSession(userId, falKey, anthropicKey);
  const sessionToken = await signToken({ userId, sessionId, role });
  audit({ event: 'sso_success', ip, userId, path: '/api/auth/sso' });

  const host = request.headers.get('host') || request.nextUrl.host;
  const proto = request.headers.get('x-forwarded-proto') || 'http';
  const redirectUrl = `${proto}://${host}/generate`;

  const response = NextResponse.redirect(redirectUrl);
  response.cookies.set('session', sessionToken, {
    httpOnly: true,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  });
  response.cookies.set('user-info', JSON.stringify({
    userId,
    userName,
    role,
    authMethod: 'sso',
    hasFalKey: !!falKey,
  }), {
    httpOnly: false,
    secure: process.env.COOKIE_SECURE === 'true',
    sameSite: 'lax',
    maxAge: 86400,
    path: '/',
  });
  return response;
}
