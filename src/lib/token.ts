async function getKey(): Promise<CryptoKey> {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET environment variable is required');
  }
  const enc = new TextEncoder();
  return crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}

function toBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export async function signToken(
  payload: Record<string, unknown>,
  ttlSeconds = 604800,
): Promise<string> {
  const data = { ...payload, exp: Math.floor(Date.now() / 1000) + ttlSeconds };
  const enc = new TextEncoder();
  const payloadBytes = enc.encode(JSON.stringify(data));
  const payloadB64 = toBase64Url(payloadBytes);
  const key = await getKey();
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
  return `${payloadB64}.${toBase64Url(sig)}`;
}

function fromBase64Url(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function verifyToken(
  token: string,
): Promise<Record<string, unknown> | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payloadB64, sigB64] = parts;
    const enc = new TextEncoder();
    const key = await getKey();
    const expectedSig = await crypto.subtle.sign('HMAC', key, enc.encode(payloadB64));
    const expectedBytes = new Uint8Array(expectedSig);
    const actualBytes = fromBase64Url(sigB64);
    if (expectedBytes.length !== actualBytes.length) return null;
    let diff = 0;
    for (let i = 0; i < expectedBytes.length; i++) diff |= expectedBytes[i] ^ actualBytes[i];
    if (diff !== 0) return null;
    const json = new TextDecoder().decode(fromBase64Url(payloadB64));
    const data = JSON.parse(json) as Record<string, unknown>;
    if (typeof data.exp === 'number' && data.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return data;
  } catch {
    return null;
  }
}
