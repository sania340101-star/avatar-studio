import { NextRequest, NextResponse } from 'next/server';
import { getJob, retryJob } from '@/lib/jobs';
import { getSession } from '@/lib/sessions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey;
  if (!falKey) return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });

  const { id } = await params;
  const job = getJob(id);
  if (!job || job.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status !== 'error') return NextResponse.json({ error: 'Only failed jobs can be retried' }, { status: 400 });

  const retried = retryJob(id, falKey);
  if (!retried) return NextResponse.json({ error: 'Retry failed' }, { status: 500 });

  return NextResponse.json(retried);
}
