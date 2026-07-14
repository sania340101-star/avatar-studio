import { NextRequest, NextResponse } from 'next/server';
import { getPosePresets, createPosePreset, updatePosePreset, deletePosePreset, seedPosePresets } from '@/lib/storage';
import { DEFAULT_POSE_PRESETS } from '@/lib/pose-preset-defaults';

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  seedPosePresets(DEFAULT_POSE_PRESETS);
  return NextResponse.json(getPosePresets());
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { label, value } = await req.json();
  if (!label?.trim() || !value?.trim()) return NextResponse.json({ error: 'label and value required' }, { status: 400 });

  return NextResponse.json(createPosePreset({ label: label.trim(), value: value.trim() }));
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { id, label, value } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const updates: Record<string, string> = {};
  if (label?.trim()) updates.label = label.trim();
  if (value?.trim()) updates.value = value.trim();

  const result = updatePosePreset(id, updates);
  if (!result) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  if (!deletePosePreset(id)) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
