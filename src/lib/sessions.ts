import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';

export interface SessionData {
  userId: string;
  falKey?: string;
  anthropicKey?: string;
  createdAt: number;
  lastAccess: number;
}

const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data');
const SESSIONS_FILE = join(DATA_DIR, 'sessions.json');
const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (sliding window extends on each access)

function generateId(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

function loadSessions(): Map<string, SessionData> {
  try {
    if (existsSync(SESSIONS_FILE)) {
      const raw = readFileSync(SESSIONS_FILE, 'utf8');
      const entries: [string, SessionData][] = JSON.parse(raw);
      return new Map(entries);
    }
  } catch { /* corrupted file — start fresh */ }
  return new Map();
}

function saveSessions(sessions: Map<string, SessionData>): void {
  try {
    if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
    writeFileSync(SESSIONS_FILE, JSON.stringify([...sessions]), 'utf8');
  } catch { /* write failed — sessions will be re-created on next login */ }
}

function cleanup(sessions: Map<string, SessionData>): boolean {
  const now = Date.now();
  let changed = false;
  for (const [id, session] of sessions) {
    if (now - session.lastAccess > TTL_MS) {
      sessions.delete(id);
      changed = true;
    }
  }
  return changed;
}

// Periodic cleanup every 10 minutes
setInterval(() => {
  const sessions = loadSessions();
  if (cleanup(sessions)) saveSessions(sessions);
}, 10 * 60 * 1000).unref?.();

export function createSession(
  userId: string,
  falKey?: string,
  anthropicKey?: string,
): string {
  const sessions = loadSessions();
  cleanup(sessions);
  const id = generateId();
  const now = Date.now();
  sessions.set(id, { userId, falKey, anthropicKey, createdAt: now, lastAccess: now });
  saveSessions(sessions);
  return id;
}

export function getSession(sessionId: string): SessionData | null {
  const sessions = loadSessions();
  const session = sessions.get(sessionId);
  if (!session) return null;
  if (Date.now() - session.lastAccess > TTL_MS) {
    sessions.delete(sessionId);
    saveSessions(sessions);
    return null;
  }
  session.lastAccess = Date.now();
  saveSessions(sessions);
  return session;
}

export function updateSessionKeys(sessionId: string, falKey?: string, anthropicKey?: string): boolean {
  const sessions = loadSessions();
  const session = sessions.get(sessionId);
  if (!session) return false;
  if (falKey !== undefined) session.falKey = falKey || undefined;
  if (anthropicKey !== undefined) session.anthropicKey = anthropicKey || undefined;
  session.lastAccess = Date.now();
  saveSessions(sessions);
  return true;
}

export function deleteSession(sessionId: string): void {
  const sessions = loadSessions();
  if (sessions.has(sessionId)) {
    sessions.delete(sessionId);
    saveSessions(sessions);
  }
}
