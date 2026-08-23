import { NextRequest, NextResponse } from 'next/server';
import { existsSync, statSync, readFileSync, openSync, readSync, closeSync } from 'fs';
import { join, extname, resolve } from 'path';
import { getUploadsDir } from '@/lib/storage';
const MIME_MAP: Record<string, string> = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif',
  '.mp4': 'video/mp4', '.webm': 'video/webm', '.mov': 'video/quicktime',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ogg': 'audio/ogg',
  '.aac': 'audio/aac', '.m4a': 'audio/mp4',
};
export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const { path } = await params;
  const filename = path.join('/');
  const uploadsDir = resolve(getUploadsDir());
  const filePath = resolve(join(uploadsDir, filename));
  if (!filePath.startsWith(uploadsDir)) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  if (!existsSync(filePath)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const ext = extname(filePath).toLowerCase();
  const contentType = MIME_MAP[ext] || 'application/octet-stream';
  const stat = statSync(filePath);
  const fileSize = stat.size;
  const isDownload = req.nextUrl.searchParams.get('download') === '1';

  const rangeHeader = req.headers.get('range');
  if (rangeHeader) {
    const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
    if (match) {
      const start = parseInt(match[1], 10);
      const end = match[2] ? parseInt(match[2], 10) : Math.min(start + 4 * 1024 * 1024, fileSize) - 1;
      const chunkSize = end - start + 1;
      const buffer = Buffer.alloc(chunkSize);
      const fd = openSync(filePath, 'r');
      readSync(fd, buffer, 0, chunkSize, start);
      closeSync(fd);
      return new NextResponse(buffer, {
        status: 206,
        headers: {
          'Content-Type': contentType,
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Content-Length': String(chunkSize),
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'public, max-age=31536000, immutable',
        },
      });
    }
  }

  const buffer = readFileSync(filePath);
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Content-Length': String(fileSize),
    'Accept-Ranges': 'bytes',
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'public, max-age=31536000, immutable',
  };
  if (isDownload) {
    const basename = filePath.split(/[\\/]/).pop() || 'download';
    headers['Content-Disposition'] = `attachment; filename="${basename}"`;
  }
  return new NextResponse(buffer, { headers });
}
