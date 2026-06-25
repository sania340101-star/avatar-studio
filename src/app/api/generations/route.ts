import { NextRequest, NextResponse } from 'next/server';
import { getGenerations, addGeneration, deleteGeneration } from '@/lib/storage';

export async function GET(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  if (!projectId) return NextResponse.json({ error: 'projectId required' }, { status: 400 });
  const type = req.nextUrl.searchParams.get('type') as 'image' | 'video' | null;
  return NextResponse.json(getGenerations(projectId, type || undefined));
}

export async function POST(req: NextRequest) {
  const gen = await req.json();
  if (!gen.projectId || !gen.userId) {
    return NextResponse.json({ error: 'projectId and userId required' }, { status: 400 });
  }
  gen.id = gen.id || `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  gen.createdAt = gen.createdAt || Date.now();
  return NextResponse.json(addGeneration(gen));
}

export async function DELETE(req: NextRequest) {
  const projectId = req.nextUrl.searchParams.get('projectId');
  const generationId = req.nextUrl.searchParams.get('generationId');
  if (!projectId || !generationId) {
    return NextResponse.json({ error: 'projectId and generationId required' }, { status: 400 });
  }
  deleteGeneration(projectId, generationId);
  return NextResponse.json({ ok: true });
}
