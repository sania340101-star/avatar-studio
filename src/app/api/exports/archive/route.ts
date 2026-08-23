import { NextRequest, NextResponse } from 'next/server';
import { getExportSession, getUploadsDir } from '@/lib/storage';
import { join } from 'path';
import { existsSync } from 'fs';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const archiver = require('archiver');

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const sessionId = req.nextUrl.searchParams.get('id');
  const versionId = req.nextUrl.searchParams.get('versionId');
  if (!sessionId) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const session = getExportSession(sessionId);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const version = versionId
    ? session.exports?.find(v => v.id === versionId)
    : session.exports?.[session.exports.length - 1];
  if (!version) return NextResponse.json({ error: 'No export version found' }, { status: 404 });

  const uploadsDir = getUploadsDir();
  const videoFilename = version.url.replace('/api/files/', '');
  const videoPath = join(uploadsDir, videoFilename);
  if (!existsSync(videoPath)) return NextResponse.json({ error: 'Video file not found' }, { status: 404 });

  const manifestFilename = version.manifestUrl?.replace('/api/files/', '');
  const manifestPath = manifestFilename ? join(uploadsDir, manifestFilename) : null;

  const archive = archiver('zip', { zlib: { level: 1 } });
  const chunks: Buffer[] = [];

  archive.on('data', (chunk: Buffer) => chunks.push(chunk));

  const done = new Promise<void>((resolve, reject) => {
    archive.on('end', resolve);
    archive.on('error', reject);
  });

  archive.file(videoPath, { name: 'master.mp4' });
  if (manifestPath && existsSync(manifestPath)) {
    archive.file(manifestPath, { name: 'manifest.json' });
  }
  archive.finalize();

  await done;

  const buffer = Buffer.concat(chunks);
  const safeName = session.name.replace(/[^a-zA-Z0-9-_ ]/g, '') || 'export';

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${safeName}.zip"`,
      'Content-Length': String(buffer.length),
    },
  });
}
