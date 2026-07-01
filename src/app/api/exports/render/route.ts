import { NextRequest, NextResponse } from 'next/server';
import { getExportSession, updateExportSession, addGeneration, getUploadsDir } from '@/lib/storage';
import { DEVICE_PRESETS } from '@/lib/models';
import { Generation, ExportSession } from '@/lib/types';
import { spawn } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

function resolveLocalPath(clipUrl: string): string | null {
  const match = clipUrl.match(/\/api\/files\/(.+)$/);
  if (!match) return null;
  const filename = decodeURIComponent(match[1]);
  const filePath = join(getUploadsDir(), filename);
  return existsSync(filePath) ? filePath : null;
}

async function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let stderr = '';
    proc.stderr?.on('data', (d: Buffer) => { stderr += d.toString(); });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`FFmpeg exited with code ${code}: ${stderr.slice(-500)}`));
    });
    proc.on('error', reject);
  });
}

async function processExport(sessionId: string, userId: string) {
  const session = getExportSession(sessionId);
  if (!session || session.userId !== userId) return;

  const preset = DEVICE_PRESETS[session.device];
  const { width: W, height: H } = preset;
  const transform = session.transform;
  const uploadsDir = getUploadsDir();
  const tempFiles: string[] = [];

  try {
    const scaledW = Math.round(W * transform.scale);
    const scaledH = Math.round(H * transform.scale);

    for (let i = 0; i < session.clips.length; i++) {
      const clip = session.clips[i];
      const inputPath = resolveLocalPath(clip.url);
      if (!inputPath) throw new Error(`Source file not found for clip ${i + 1}: ${clip.url}`);

      const tempOut = join(uploadsDir, `_export_tmp_${sessionId}_${i}.mp4`);
      tempFiles.push(tempOut);

      await runFfmpeg([
        '-i', inputPath,
        '-filter_complex',
        `[0:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},setsar=1[scaled];` +
        `color=black:s=${W}x${H}:r=60:d=999[bg];` +
        `[bg][scaled]overlay=${transform.offsetX}:${transform.offsetY}:shortest=1[out]`,
        '-map', '[out]',
        '-r', '60',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', '18',
        '-pix_fmt', 'yuv420p',
        '-an',
        '-y',
        tempOut,
      ]);
    }

    const concatListPath = join(uploadsDir, `_export_concat_${sessionId}.txt`);
    const concatContent = tempFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
    writeFileSync(concatListPath, concatContent);
    tempFiles.push(concatListPath);

    const outputFilename = `export-${sessionId}-${Date.now()}.mp4`;
    const outputPath = join(uploadsDir, outputFilename);

    await runFfmpeg([
      '-f', 'concat',
      '-safe', '0',
      '-i', concatListPath,
      '-c', 'copy',
      '-y',
      outputPath,
    ]);

    const exportUrl = `/api/files/${outputFilename}`;

    const gen: Generation = {
      id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      projectId: session.clips[0].projectId,
      userId,
      type: 'export',
      modelId: 'ffmpeg',
      modelLabel: `Export — ${preset.name}`,
      prompt: `${session.name} (${session.clips.length} clips, ${W}x${H}@60fps)`,
      params: {
        exportSessionId: session.id,
        device: session.device,
        clipCount: session.clips.length,
        resolution: `${W}x${H}`,
        fps: 60,
        transform,
      },
      referenceUrls: session.clips.map(c => c.url),
      resultUrls: [exportUrl],
      status: 'completed',
      createdAt: Date.now(),
    };
    addGeneration(gen);

    const currentSession = getExportSession(sessionId);
    const prevExports = currentSession?.exports || [];
    const newVersion = { id: gen.id, url: exportUrl, createdAt: gen.createdAt };
    updateExportSession(sessionId, {
      status: 'done',
      exportUrl,
      exports: [...prevExports, newVersion],
    } as Partial<ExportSession>);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    updateExportSession(sessionId, { status: 'error', error: msg });
  } finally {
    for (const f of tempFiles) {
      try { unlinkSync(f); } catch {}
    }
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id');
  if (!userId) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const session = getExportSession(id);
  if (!session) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (session.userId !== userId) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  if (session.clips.length === 0) return NextResponse.json({ error: 'No clips in session' }, { status: 400 });
  if (session.status === 'exporting') return NextResponse.json({ error: 'Already exporting' }, { status: 409 });

  updateExportSession(id, { status: 'exporting', error: undefined, exportUrl: undefined });

  processExport(id, userId).catch(() => {});

  return NextResponse.json({ status: 'exporting' });
}
