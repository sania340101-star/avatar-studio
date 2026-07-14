import { NextRequest, NextResponse } from 'next/server';
import {
  getProject, getTemplate, getExportSession, getPoseMatrix,
  shareProject, shareTemplate, shareExportSession, sharePoseMatrix,
} from '@/lib/storage';

const VALID_TYPES = ['project', 'template', 'export', 'pose-matrix'] as const;
type DuplicateType = typeof VALID_TYPES[number];

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body: { entityType?: string; entityId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { entityType, entityId } = body;

  if (!entityType || !VALID_TYPES.includes(entityType as DuplicateType)) {
    return NextResponse.json({ error: 'entityType must be project, template, export, or pose-matrix' }, { status: 400 });
  }
  if (!entityId || typeof entityId !== 'string') {
    return NextResponse.json({ error: 'entityId required' }, { status: 400 });
  }

  try {
    if (entityType === 'project') {
      const source = getProject(entityId);
      if (!source) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (source.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const result = shareProject(entityId, userId);
      return NextResponse.json({ ok: true, newEntityId: result.projectId, generationCount: result.generationCount });
    }

    if (entityType === 'template') {
      const source = getTemplate(entityId);
      if (!source) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      if (source.createdBy !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const newId = shareTemplate(entityId, userId);
      return NextResponse.json({ ok: true, newEntityId: newId });
    }

    if (entityType === 'export') {
      const source = getExportSession(entityId);
      if (!source) return NextResponse.json({ error: 'Export not found' }, { status: 404 });
      if (source.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const newId = shareExportSession(entityId, userId);
      return NextResponse.json({ ok: true, newEntityId: newId });
    }

    if (entityType === 'pose-matrix') {
      const source = getPoseMatrix(entityId);
      if (!source) return NextResponse.json({ error: 'Pose matrix not found' }, { status: 404 });
      if (source.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const newId = sharePoseMatrix(entityId, userId);
      return NextResponse.json({ ok: true, newEntityId: newId });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Duplicate failed' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}
