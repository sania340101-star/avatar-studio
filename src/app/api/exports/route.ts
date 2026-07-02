import { NextRequest, NextResponse } from 'next/server';
import { getExportSessions, getExportSession, createExportSession, updateExportSession, deleteExportSession, deleteExportVersion } from '@/lib/storage';
import { ExportSession } from '@/lib/types';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (id) {
    const session = getExportSession(id);
    if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (session.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    return NextResponse.json(session);
  }

  return NextResponse.json(getExportSessions(userId));
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json();
  const session: ExportSession = {
    id: `exp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    name: body.name || 'Untitled Export',
    device: body.device || 'hh1x3',
    clips: body.clips || [],
    transform: body.transform || { offsetX: 0, offsetY: 0, scale: 1 },
    status: 'draft',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  return NextResponse.json(createExportSession(session));
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json();
  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = getExportSession(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const updated = updateExportSession(id, updates);
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const existing = getExportSession(id);
  if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (existing.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const versionId = req.nextUrl.searchParams.get('versionId');
  if (versionId) {
    const result = deleteExportVersion(id, versionId);
    return NextResponse.json({ ok: result.deleted, removedGeneration: result.removedGeneration });
  }

  deleteExportSession(id);
  return NextResponse.json({ ok: true });
}
