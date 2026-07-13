import { NextRequest, NextResponse } from 'next/server';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate, getTemplate } from '@/lib/storage';
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  const all = getTemplates();
  if (!userId) return NextResponse.json([]);
  const showAll = role === 'admin' && req.nextUrl.searchParams.get('all') === '1';
  if (showAll) return NextResponse.json(all);
  return NextResponse.json(all.filter(t => t.createdBy === userId));
}
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await req.json();
  if (!body.name || (!body.slots?.length && !body.modelId)) {
    return NextResponse.json({ error: 'name and at least one slot are required' }, { status: 400 });
  }
  body.createdBy = userId;
  return NextResponse.json(createTemplate(body));
}
export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = getTemplate(body.id);
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (existing.createdBy !== userId && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  const { id, ...updates } = body;
  delete updates.createdBy;
  delete updates.createdAt;
  const updated = updateTemplate(id, updates);
  if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json(updated);
}
export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  const role = req.headers.get('x-user-role');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const existing = getTemplate(id);
  if (!existing) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  if (existing.createdBy !== userId && role !== 'admin') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
