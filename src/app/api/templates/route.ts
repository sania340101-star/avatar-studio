import { NextRequest, NextResponse } from 'next/server';
import { getTemplates, createTemplate, updateTemplate, deleteTemplate } from '@/lib/storage';

export async function GET() {
  return NextResponse.json(getTemplates());
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.name || !body.modelId || !body.promptTemplate || !body.createdBy) {
    return NextResponse.json({ error: 'name, modelId, promptTemplate, and createdBy are required' }, { status: 400 });
  }
  return NextResponse.json(createTemplate(body));
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  const { id, ...updates } = body;
  const updated = updateTemplate(id, updates);
  if (!updated) return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  return NextResponse.json(updated);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });
  deleteTemplate(id);
  return NextResponse.json({ ok: true });
}
