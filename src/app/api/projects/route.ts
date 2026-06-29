import { NextRequest, NextResponse } from 'next/server';
import { getProjects, createProject, updateProject, deleteProject, getProject } from '@/lib/storage';
import { audit } from '@/lib/audit';
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  return NextResponse.json(getProjects(userId));
}
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { title } = await req.json();
  if (!title) return NextResponse.json({ error: 'title required' }, { status: 400 });
  return NextResponse.json(createProject(userId, title));
}
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const { projectId, title } = await req.json();
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) {
    audit({ event: 'forbidden', ip: req.headers.get('x-client-ip') || 'unknown', userId: userId || undefined, path: '/api/projects', detail: `IDOR attempt on ${projectId}` });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const updated = updateProject(projectId, { title });
  if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  return NextResponse.json(updated);
}
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const project = getProject(projectId);
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  if (project.userId !== userId) {
    audit({ event: 'forbidden', ip: req.headers.get('x-client-ip') || 'unknown', userId: userId || undefined, path: '/api/projects', detail: `IDOR attempt on ${projectId}` });
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  deleteProject(projectId);
  return NextResponse.json({ ok: true });
}
