import { NextRequest, NextResponse } from 'next/server';
import { createJob, findActiveJob } from '@/lib/jobs';
import { getSession } from '@/lib/sessions';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey || process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });

  const body = await req.json();
  const { projectId, type, ...input } = body;
  if (!projectId || !type) return NextResponse.json({ error: 'projectId and type required' }, { status: 400 });
  if (!input.instruction?.trim()) return NextResponse.json({ error: 'Instruction is required.' }, { status: 400 });

  const job = createJob(userId, projectId, type, input, falKey);
  return NextResponse.json(job);
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get('projectId');
  const type = searchParams.get('type');
  if (!projectId || !type) return NextResponse.json({ error: 'projectId and type required' }, { status: 400 });

  const active = findActiveJob(userId, projectId, type);
  return NextResponse.json({ active: active || null });
}
