import { NextRequest, NextResponse } from 'next/server';
import {
  getProject, getTemplate, getExportSession, getRegisteredUsers,
  shareProject, shareTemplate, shareExportSession,
  getGenerations, shareGeneration,
} from '@/lib/storage';

const VALID_TYPES = ['project', 'template', 'export', 'generation'] as const;
type ShareType = typeof VALID_TYPES[number];

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  let body: { entityType?: string; entityId?: string; targetUserId?: string; projectId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { entityType, entityId, targetUserId } = body;

  if (!entityType || !VALID_TYPES.includes(entityType as ShareType)) {
    return NextResponse.json({ error: 'entityType must be project, template, or export' }, { status: 400 });
  }
  if (!entityId || typeof entityId !== 'string') {
    return NextResponse.json({ error: 'entityId required' }, { status: 400 });
  }
  if (!targetUserId || typeof targetUserId !== 'string') {
    return NextResponse.json({ error: 'targetUserId required' }, { status: 400 });
  }
  if (targetUserId === userId) {
    return NextResponse.json({ error: 'Cannot share with yourself' }, { status: 400 });
  }

  const knownUsers = getRegisteredUsers();
  if (!knownUsers.some(u => u.userId === targetUserId)) {
    return NextResponse.json({ error: 'Target user not found' }, { status: 404 });
  }

  try {
    if (entityType === 'project') {
      const source = getProject(entityId);
      if (!source) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (source.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const result = shareProject(entityId, targetUserId);
      return NextResponse.json({ ok: true, newEntityId: result.projectId, generationCount: result.generationCount });
    }

    if (entityType === 'template') {
      const source = getTemplate(entityId);
      if (!source) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
      if (source.createdBy !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const newId = shareTemplate(entityId, targetUserId);
      return NextResponse.json({ ok: true, newEntityId: newId });
    }

    if (entityType === 'export') {
      const source = getExportSession(entityId);
      if (!source) return NextResponse.json({ error: 'Export not found' }, { status: 404 });
      if (source.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const newId = shareExportSession(entityId, targetUserId);
      return NextResponse.json({ ok: true, newEntityId: newId });
    }

    if (entityType === 'generation') {
      const { projectId } = body;
      if (!projectId || typeof projectId !== 'string') {
        return NextResponse.json({ error: 'projectId required for generation sharing' }, { status: 400 });
      }
      const project = getProject(projectId);
      if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      const gens = getGenerations(projectId);
      if (!gens.find(g => g.id === entityId)) {
        return NextResponse.json({ error: 'Generation not found' }, { status: 404 });
      }
      const result = shareGeneration(projectId, entityId, targetUserId);
      return NextResponse.json({ ok: true, newEntityId: result.generationId, projectId: result.projectId });
    }
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Share failed' }, { status: 500 });
  }

  return NextResponse.json({ error: 'Unknown error' }, { status: 500 });
}
