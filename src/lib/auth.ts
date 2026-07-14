import { AppUser } from './types';

const SESSION_KEY = 'avatar-studio-session';
const USER_INFO_COOKIE = 'user-info';

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.match(new RegExp('(?:^|; )' + name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '=([^;]*)'));
  return match ? decodeURIComponent(match[1]) : null;
}

export function getSessionUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* fall through */ }
  try {
    const cookie = getCookie(USER_INFO_COOKIE);
    if (cookie) return JSON.parse(cookie);
  } catch { /* fall through */ }
  return null;
}

export function setSessionUser(user: AppUser): void {
  localStorage.setItem(SESSION_KEY, JSON.stringify(user));
  if (typeof document !== 'undefined') {
    document.cookie = `${USER_INFO_COOKIE}=${encodeURIComponent(JSON.stringify(user))}; path=/; max-age=604800; samesite=lax`;
  }
}

export async function clearSession(): Promise<void> {
  localStorage.removeItem(SESSION_KEY);
  try {
    await fetch('/api/auth/logout', { method: 'POST' });
  } catch { /* server may be unreachable, cookies cleared server-side anyway */ }
}

export async function initAuth(): Promise<AppUser | null> {
  if (typeof window === 'undefined') return null;

  // 1. Ask the server for authoritative user data
  try {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        const user: AppUser = data.user;
        setSessionUser(user);
        return user;
      }
    }
  } catch { /* server unreachable — fall through to cache */ }

  // 2. Fall back to localStorage cache
  try {
    const raw = localStorage.getItem(SESSION_KEY);
    if (raw) return JSON.parse(raw) as AppUser;
  } catch { /* fall through */ }

  // 3. Fall back to user-info cookie
  try {
    const cookie = getCookie(USER_INFO_COOKIE);
    if (cookie) {
      const user = JSON.parse(cookie) as AppUser;
      localStorage.setItem(SESSION_KEY, JSON.stringify(user));
      return user;
    }
  } catch { /* fall through */ }

  return null;
}
