import { NextRequest, NextResponse } from 'next/server';
import { checkBudget, getFalBalance } from '@/lib/billing';
import { getSession } from '@/lib/sessions';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const budget = checkBudget(userId);

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey || process.env.FAL_KEY || undefined;
  const falBalance = await getFalBalance(falKey);

  return NextResponse.json({
    spent: budget.spent,
    limit: budget.limit,
    remaining: budget.remaining,
    allowed: budget.allowed,
    falBalance,
  });
}
