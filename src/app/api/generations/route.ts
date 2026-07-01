import { NextRequest, NextResponse } from 'next/server';
import { getGenerations, getAllUserGenerations, addGeneration, deleteGeneration, getProject } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  const type = req.nextUrl.searchParams.get('type') as 'image' | 'video' | 'export' | null;

  if (!projectId) {
    return NextResponse.json(getAllUserGenerations(userId, type || undefined));
  }

  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  return NextResponse.json(getGenerations(projectId, type || undefined));
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const gen = await req.json();
  if (!gen.projectId) {
    return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  }

  const project = getProject(gen.projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  gen.userId = userId;
  gen.id = gen.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  gen.createdAt = gen.createdAt || Date.now();
  return NextResponse.json(addGeneration(gen));
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  const generationId = req.nextUrl.searchParams.get('generationId');
  if (!projectId || !generationId) {
    return NextResponse.json({ error: 'projectId and generationId required' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  deleteGeneration(projectId, generationId);
  return NextResponse.json({ ok: true });
}
