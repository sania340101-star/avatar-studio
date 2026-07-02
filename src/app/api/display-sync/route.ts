import { NextRequest, NextResponse } from 'next/server';

interface DisplayState {
  device: string;
  transform: { offsetX: number; offsetY: number; scale: number };
  clipUrl: string;
  clipUrls: string[];
  activeClipIdx: number;
  loop: boolean;
  updatedAt: number;
}

const store = new Map<string, DisplayState>();

setInterval(() => {
  const cutoff = Date.now() - 3600_000;
  for (const [k, v] of store) {
    if (v.updatedAt < cutoff) store.delete(k);
  }
}, 600_000);

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const state = store.get(id);
  if (!state) return NextResponse.json(null);

  return NextResponse.json(state);
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const existing = store.get(id);
  const updated: DisplayState = {
    device: body.device ?? existing?.device ?? 'hh1x3',
    transform: body.transform ?? existing?.transform ?? { offsetX: 0, offsetY: 0, scale: 1 },
    clipUrl: body.clipUrl ?? existing?.clipUrl ?? '',
    clipUrls: body.clipUrls ?? existing?.clipUrls ?? [],
    activeClipIdx: body.activeClipIdx ?? existing?.activeClipIdx ?? 0,
    loop: body.loop ?? existing?.loop ?? true,
    updatedAt: Date.now(),
  };
  store.set(id, updated);

  return NextResponse.json(updated);
}
