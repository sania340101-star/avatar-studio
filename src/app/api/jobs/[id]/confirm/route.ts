import { NextRequest, NextResponse } from 'next/server';
import { getJob, confirmJob } from '@/lib/jobs';
import { getSession } from '@/lib/sessions';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey || process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });

  const { id } = await params;
  const job = getJob(id);
  if (!job || job.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (job.status !== 'prepared') return NextResponse.json({ error: 'Job not in prepared state' }, { status: 400 });

  const body = await req.json();
  confirmJob(job, body.prompt, body.model, falKey, body.params);

  return NextResponse.json(job);
}
