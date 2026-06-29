import { NextRequest, NextResponse } from 'next/server';
import { getJob } from '@/lib/jobs';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const job = getJob(id);
  if (!job || job.userId !== userId) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json(job);
}
