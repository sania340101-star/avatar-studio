import { NextRequest, NextResponse } from 'next/server';
import { getRegisteredUsers } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const users = getRegisteredUsers().filter(u => u.userId !== userId);
  return NextResponse.json(users);
}
