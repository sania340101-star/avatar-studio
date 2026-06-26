import { NextRequest, NextResponse } from 'next/server';
import { getProjectCache, saveProjectCache } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const type = req.nextUrl.searchParams.get('type') as 'image' | 'video' | null;
  if (!projectId || !type || !['image', 'video'].includes(type)) {
    return NextResponse.json(null, { status: 400 });
  }
  const data = getProjectCache(projectId, type);
  return NextResponse.json(data);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { projectId, type, data } = body;
  if (!projectId || !type || !data || !['image', 'video'].includes(type)) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
  }
  saveProjectCache(projectId, type, data);
  return NextResponse.json({ ok: true });
}
