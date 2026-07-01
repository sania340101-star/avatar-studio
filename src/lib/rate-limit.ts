interface WindowEntry {
  count: number;
  resetAt: number;
}

const windows = new Map<string, WindowEntry>();

setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of windows) {
    if (now > entry.resetAt) windows.delete(key);
  }
}, 60_000).unref?.();

export function checkRateLimit(
  key: string,
  maxRequests: number,
  windowMs: number,
): { allowed: boolean; remaining: number; retryAfterMs: number } {
  const now = Date.now();
  const entry = windows.get(key);

  if (!entry || now > entry.resetAt) {
    windows.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: maxRequests - 1, retryAfterMs: 0 };
  }

  if (entry.count >= maxRequests) {
    return { allowed: false, remaining: 0, retryAfterMs: entry.resetAt - now };
  }

  entry.count++;
  return { allowed: true, remaining: maxRequests - entry.count, retryAfterMs: 0 };
}

interface RouteLimit {
  maxRequests: number;
  windowMs: number;
}

const ROUTE_LIMITS: [RegExp, RouteLimit][] = [
  [/^\/api\/auth\/send-otp$/, { maxRequests: 5, windowMs: 60_000 }],
  [/^\/api\/auth\/verify-otp$/, { maxRequests: 10, windowMs: 60_000 }],
  [/^\/api\/generate$/, { maxRequests: 20, windowMs: 60_000 }],
  [/^\/api\/prepare-generation$/, { maxRequests: 20, windowMs: 60_000 }],
  [/^\/api\/jobs\/batch$/, { maxRequests: 60, windowMs: 60_000 }],
  [/^\/api\/jobs\/[^/]+\/confirm$/, { maxRequests: 20, windowMs: 60_000 }],
  [/^\/api\/upload$/, { maxRequests: 30, windowMs: 60_000 }],
];

const DEFAULT_LIMIT: RouteLimit = { maxRequests: 100, windowMs: 60_000 };

export function getRouteLimit(pathname: string): RouteLimit {
  for (const [pattern, limit] of ROUTE_LIMITS) {
    if (pattern.test(pathname)) return limit;
  }
  return DEFAULT_LIMIT;
}
