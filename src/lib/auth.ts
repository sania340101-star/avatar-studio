import { AppUser } from './types';

const SESSION_KEY = 'avatar-studio-session';

export function getSessionUser(): AppUser | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function setSessionUser(user: AppUser): void {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

export function clearSession(): void {
  sessionStorage.removeItem(SESSION_KEY);
}

export function parseJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1]));
    if (payload.exp && payload.exp * 1000 < Date.now()) return null;
    return payload;
  } catch { return null; }
}

export function tryAutoLogin(): AppUser | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.search);
  const token = params.get('token');
  if (!token) return getSessionUser();

  const payload = parseJwtPayload(token);
  if (!payload || !payload.appId) return null;

  const serviceKeys = (payload.serviceKeys || {}) as Record<string, string>;
  const user: AppUser = {
    userId: payload.userId as string,
    userName: payload.userName as string,
    role: (payload.role as string) || 'user',
    authMethod: 'sso',
    falKey: serviceKeys.fal_ai_api_key || serviceKeys.fal_ai_access_token,
    anthropicKey: serviceKeys.anthropic_api_key,
  };

  setSessionUser(user);
  window.history.replaceState({}, '', window.location.pathname);
  return user;
}
