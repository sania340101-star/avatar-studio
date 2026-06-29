import { NextRequest, NextResponse } from 'next/server';
import { createBatchJobs, getBatchJobs } from '@/lib/jobs';
import { getSession } from '@/lib/sessions';
import { getTemplate } from '@/lib/storage';

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey || process.env.FAL_KEY;
  if (!falKey) return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });

  const body = await req.json();
  const { projectId, templateId, instruction, ...sharedInput } = body;
  if (!projectId || !templateId) {
    return NextResponse.json({ error: 'projectId and templateId required' }, { status: 400 });
  }

  const template = getTemplate(templateId);
  if (!template || !template.slots?.length) {
    return NextResponse.json({ error: 'Template not found or has no slots' }, { status: 404 });
  }

  try {
    const { batchId, jobs } = createBatchJobs(
      userId, projectId, templateId, template.slots,
      instruction || template.promptTemplate || '',
      sharedInput, falKey,
    );
    return NextResponse.json({ batchId, jobs });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Batch creation failed' }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const batchId = req.nextUrl.searchParams.get('batchId');
  if (!batchId) return NextResponse.json({ error: 'batchId required' }, { status: 400 });

  const batchJobs = getBatchJobs(batchId).filter(j => j.userId === userId);
  return NextResponse.json({ batchId, jobs: batchJobs });
}
