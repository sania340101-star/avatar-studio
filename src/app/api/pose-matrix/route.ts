import { NextRequest, NextResponse } from 'next/server';
import { getPoseMatrices, createPoseMatrix, getPoseMatrix, updatePoseMatrix, deletePoseMatrix } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  return NextResponse.json(getPoseMatrices(userId));
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const matrix = createPoseMatrix({
    userId,
    name: body.name || 'Untitled',
    poses: body.poses || [],
    clips: body.clips || [],
    modelId: body.modelId || '',
    modelLabel: body.modelLabel || '',
    duration: body.duration || 5,
    aspectRatio: body.aspectRatio || '9:16',
    quality: body.quality || 'high',
    fps: body.fps || 24,
  });
  return NextResponse.json(matrix);
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = getPoseMatrix(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  const updated = updatePoseMatrix(id, updates);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = getPoseMatrix(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  deletePoseMatrix(id);
  return NextResponse.json({ ok: true });
}
