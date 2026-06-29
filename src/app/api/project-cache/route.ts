import { NextRequest, NextResponse } from 'next/server';
import { getProjectCache, saveProjectCache, getProject } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get('projectId');
  const type = req.nextUrl.searchParams.get('type') as 'image' | 'video' | null;
  if (!projectId || !type || !['image', 'video'].includes(type)) {
    return NextResponse.json(null, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) return NextResponse.json(null, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const data = getProjectCache(projectId, type);
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const body = await req.json();
  const { projectId, type, data } = body;
  if (!projectId || !type || !data || !['image', 'video'].includes(type)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }

  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  saveProjectCache(projectId, type, data);
  return NextResponse.json({ ok: true });
}
