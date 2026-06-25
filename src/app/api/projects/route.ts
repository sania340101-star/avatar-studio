import { NextRequest, NextResponse } from 'next/server';
import { getProjects, createProject, updateProject, deleteProject } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const userId = req.nextUrl.searchParams.get('userId');
  if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
  return NextResponse.json(getProjects(userId));
}

export async function POST(req: NextRequest) {
  const { userId, title } = await req.json();
  if (!userId || !title) return NextResponse.json({ error: 'userId and title required' }, { status: 400 });
  return NextResponse.json(createProject(userId, title));
}

export async function PATCH(req: NextRequest) {
  const { projectId, title } = await req.json();
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const updated = updateProject(projectId, { title });
  if (!updated) return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  deleteProject(projectId);
  return NextResponse.json({ ok: true });
}
