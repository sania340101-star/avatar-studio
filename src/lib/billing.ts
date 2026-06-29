import Database from 'better-sqlite3';
import { join } from 'path';
import { existsSync, mkdirSync } from 'fs';

const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const DB_PATH = join(DATA_DIR, 'billing.db');
const DEFAULT_DAILY_LIMIT = 5.0;

let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.exec(`
    CREATE TABLE IF NOT EXISTS spending (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      cost_usd REAL NOT NULL,
      model TEXT NOT NULL DEFAULT '',
      gen_type TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS idx_spending_user_date
      ON spending(user_id, created_at);

    CREATE TABLE IF NOT EXISTS user_limits (
      user_id TEXT PRIMARY KEY,
      daily_limit_usd REAL NOT NULL DEFAULT ${DEFAULT_DAILY_LIMIT}
    );
  `);
  return _db;
}

export function recordSpending(
  userId: string,
  costUsd: number,
  model: string,
  genType: string,
): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO spending (user_id, cost_usd, model, gen_type) VALUES (?, ?, ?, ?)',
  ).run(userId, costUsd, model, genType);
}

export function getDailySpent(userId: string): number {
  const db = getDb();
  const row = db.prepare(
    "SELECT COALESCE(SUM(cost_usd), 0) as total FROM spending WHERE user_id = ? AND date(created_at) = date('now')",
  ).get(userId) as { total: number };
  return row.total;
}

export function getDailyLimit(userId: string): number {
  const db = getDb();
  const row = db.prepare(
    'SELECT daily_limit_usd FROM user_limits WHERE user_id = ?',
  ).get(userId) as { daily_limit_usd: number } | undefined;
  return row?.daily_limit_usd ?? DEFAULT_DAILY_LIMIT;
}

export function setDailyLimit(userId: string, limitUsd: number): void {
  const db = getDb();
  db.prepare(
    'INSERT INTO user_limits (user_id, daily_limit_usd) VALUES (?, ?) ON CONFLICT(user_id) DO UPDATE SET daily_limit_usd = ?',
  ).run(userId, limitUsd, limitUsd);
}

export function checkBudget(userId: string): {
  allowed: boolean;
  spent: number;
  limit: number;
  remaining: number;
} {
  const spent = getDailySpent(userId);
  const limit = getDailyLimit(userId);
  const remaining = Math.max(0, limit - spent);
  return { allowed: spent < limit, spent, limit, remaining };
}

let _falBalanceCache: { value: number; ts: number } | null = null;
const FAL_CACHE_TTL = 60_000;

export async function getFalBalance(falKey?: string): Promise<number | null> {
  if (!falKey) return null;
  if (_falBalanceCache && Date.now() - _falBalanceCache.ts < FAL_CACHE_TTL) {
    return _falBalanceCache.value;
  }
  try {
    const res = await fetch('https://api.fal.ai/v1/account/billing?expand=credits', {
      headers: { Authorization: `Key ${falKey}` },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const balance = data.credits?.current_balance ?? data.balance ?? null;
    if (typeof balance === 'number') {
      _falBalanceCache = { value: balance, ts: Date.now() };
    }
    return balance;
  } catch {
    return null;
  }
}
