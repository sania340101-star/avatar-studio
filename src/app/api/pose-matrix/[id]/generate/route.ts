import { NextRequest, NextResponse } from 'next/server';
import { getPoseMatrix, updatePoseMatrix } from '@/lib/storage';
import { getSession } from '@/lib/sessions';
import { createBatchFromMatrix } from '@/lib/jobs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const sessionId = req.headers.get('x-session-id');
  const session = sessionId ? getSession(sessionId) : null;
  const falKey = session?.falKey;
  if (!falKey) return NextResponse.json({ error: 'fal.ai API key not configured.' }, { status: 400 });

  const { id } = await params;
  const matrix = getPoseMatrix(id);
  if (!matrix) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (matrix.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (matrix.poses.length === 0) return NextResponse.json({ error: 'No poses defined' }, { status: 400 });
  if (matrix.clips.length === 0) return NextResponse.json({ error: 'No clips defined' }, { status: 400 });
  if (!matrix.modelId) return NextResponse.json({ error: 'No model selected' }, { status: 400 });

  const body = await req.json().catch(() => ({}));
  const projectId = body.projectId || 'pose-matrix';
  const poseImages: Record<string, string> = body.poseImages || {};

  const missingPoses = matrix.poses.filter(p => !poseImages[p.id]);
  if (missingPoses.length > 0) {
    return NextResponse.json({ error: `Missing images for poses: ${missingPoses.map(p => p.name).join(', ')}` }, { status: 400 });
  }

  try {
    const { batchId, jobs } = createBatchFromMatrix(matrix, userId, projectId, falKey, poseImages);
    updatePoseMatrix(id, { lastBatchId: batchId });
    return NextResponse.json({ batchId, jobs });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Generation failed' }, { status: 400 });
  }
}
