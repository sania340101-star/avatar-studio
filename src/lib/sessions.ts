export interface SessionData {
  userId: string;
  falKey?: string;
  anthropicKey?: string;
  createdAt: number;
}

const sessions = new Map<string, SessionData>();
const TTL_MS = 24 * 60 * 60 * 1000;

function generateId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function cleanup() {
  const now = Date.now();
  for (const [id, session] of sessions) {
    if (now - session.createdAt > TTL_MS) {
      sessions.delete(id);
    }
  }
}

setInterval(cleanup, 10 * 60 * 1000).unref?.();

export function createSession(
  userId: string,
  falKey?: string,
  anthropicKey?: string,
): string {
  const id = generateId();
  sessions.set(id, { userId, falKey, anthropicKey, createdAt: Date.now() });
  return id;
}

export function getSession(sessionId: string): SessionData | null {
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.createdAt > TTL_MS) {
    sessions.delete(sessionId);
    return null;
  }
  return session;
}

export function deleteSession(sessionId: string): void {
  sessions.delete(sessionId);
}
