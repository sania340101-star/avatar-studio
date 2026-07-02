import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

const DIR = path.join(process.cwd(), 'data', 'display-sync');

function filePath(id: string): string {
  return path.join(DIR, `${id.replace(/[^a-zA-Z0-9-_]/g, '')}.json`);
}

function readState(id: string): Record<string, unknown> | null {
  try {
    const raw = fs.readFileSync(filePath(id), 'utf-8');
    const data = JSON.parse(raw);
    if (data.updatedAt && Date.now() - data.updatedAt > 3600_000) {
      fs.unlinkSync(filePath(id));
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function writeState(id: string, state: Record<string, unknown>): void {
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(filePath(id), JSON.stringify(state));
}

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  return NextResponse.json(readState(id), {
    headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate', 'Pragma': 'no-cache' },
  });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const body = await req.json();
  const existing = readState(id) || {};
  const updated = {
    device: body.device ?? existing.device ?? 'hh1x3',
    transform: body.transform ?? existing.transform ?? { offsetX: 0, offsetY: 0, scale: 1 },
    clipUrl: body.clipUrl ?? existing.clipUrl ?? '',
    clipUrls: body.clipUrls ?? existing.clipUrls ?? [],
    activeClipIdx: body.activeClipIdx ?? existing.activeClipIdx ?? 0,
    loop: body.loop ?? existing.loop ?? true,
    updatedAt: Date.now(),
  };
  writeState(id, updated);

  return NextResponse.json(updated);
}
