import { NextRequest, NextResponse } from 'next/server';
import { getExportSession, updateExportSession, addGeneration, getUploadsDir } from '@/lib/storage';
import { DEVICE_PRESETS } from '@/lib/models';
import { Generation, ExportSession } from '@/lib/types';
import { spawn, execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_FPS = 60;

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

function probeFps(filePath: string): number {
  try {
    const raw = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate -of csv=p=0 "${filePath}"`,
      { timeout: 15000 },
    ).toString().trim();
    const [num, den] = raw.split('/');
    return parseInt(num) / (parseInt(den) || 1);
  } catch {
    return 60;
  }
}

function probeDuration(filePath: string): number {
  try {
    const raw = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=duration -of csv=p=0 "${filePath}"`,
      { timeout: 15000 },
    ).toString().trim();
    return parseFloat(raw) || 0;
  } catch {
    return 0;
  }
}

async function xfadeConcat(
  clipPaths: string[],
  outputPath: string,
  blendFrames: number,
  transition: string,
  crf: number,
): Promise<void> {
  if (clipPaths.length < 2) {
    throw new Error('Need at least 2 clips for crossfade');
  }

  const blendSec = blendFrames / OUTPUT_FPS;
  const durations = clipPaths.map(p => probeDuration(p));
  console.log(`[EXPORT] xfadeConcat: clips=${clipPaths.length} blendSec=${blendSec.toFixed(4)} durations=[${durations.map(d => d.toFixed(4)).join(', ')}]`);

  for (let i = 0; i < durations.length; i++) {
    if (durations[i] < blendSec * 2) {
      throw new Error(`Clip ${i + 1} too short (${durations[i].toFixed(1)}s) for ${blendSec.toFixed(1)}s crossfade`);
    }
  }

  const inputs = clipPaths.flatMap(p => ['-i', p]);
  const n = clipPaths.length;
  const filterParts: string[] = [];
  let offset = durations[0] - blendSec;

  filterParts.push(
    `[0:v][1:v]xfade=transition=${transition}:duration=${blendSec.toFixed(4)}:offset=${offset.toFixed(4)}[v01]`
  );

  for (let i = 2; i < n; i++) {
    const prevLabel = `v0${i - 1}`;
    const nextLabel = i === n - 1 ? 'vout' : `v0${i}`;
    offset += durations[i - 1] - blendSec;
    filterParts.push(
      `[${prevLabel}][${i}:v]xfade=transition=${transition}:duration=${blendSec.toFixed(4)}:offset=${offset.toFixed(4)}[${nextLabel}]`
    );
  }

  const lastLabel = n === 2 ? 'v01' : 'vout';
  const filter = filterParts.join('; ');
  console.log(`[EXPORT] xfadeConcat filter: ${filter}`);

  await runFfmpeg([
    ...inputs,
    '-filter_complex', filter,
    '-map', `[${lastLabel}]`,
    '-r', String(OUTPUT_FPS),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y', outputPath,
  ]);
}

async function seamlessLoop(
  inputPath: string,
  outputPath: string,
  blendFrames: number,
  transition: string,
  crf: number,
): Promise<void> {
  const totalDuration = probeDuration(inputPath);
  const blendSec = blendFrames / OUTPUT_FPS;
  console.log(`[EXPORT] seamlessLoop: duration=${totalDuration.toFixed(4)}s blendSec=${blendSec.toFixed(4)}s`);

  if (blendSec >= totalDuration * 0.5) {
    throw new Error('Blend too long for video duration');
  }

  const tailStart = totalDuration - blendSec;
  const bodyEnd = totalDuration - blendSec;
  const filter = [
    `[0]split=3[a][b][c]`,
    `[a]trim=start=${tailStart.toFixed(4)}:end=${totalDuration.toFixed(4)},setpts=PTS-STARTPTS[tail]`,
    `[b]trim=start=0:end=${blendSec.toFixed(4)},setpts=PTS-STARTPTS[head]`,
    `[c]trim=start=${blendSec.toFixed(4)}:end=${bodyEnd.toFixed(4)},setpts=PTS-STARTPTS[body]`,
    `[tail][head]xfade=transition=${transition}:duration=${blendSec.toFixed(4)}:offset=0[blend]`,
    `[blend][body]concat=n=2:v=1:a=0[out]`,
  ].join('; ');

  await runFfmpeg([
    '-i', inputPath,
    '-filter_complex', filter,
    '-map', '[out]',
    '-r', String(OUTPUT_FPS),
    '-c:v', 'libx264',
    '-preset', 'fast',
    '-crf', String(crf),
    '-pix_fmt', 'yuv420p',
    '-an',
    '-y', outputPath,
  ]);
}

function finishExport(
  session: ExportSession, sessionId: string, userId: string,
  exportUrl: string, preset: { name: string }, W: number, H: number,
  transform: { offsetX: number; offsetY: number; scale: number },
) {
  const gen: Generation = {
    id: `gen-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    projectId: session.clips.find(c => c.projectId)?.projectId || 'exports',
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
    const clipCount = session.clips.length;
    const useSeamless = session.crossfadeEnabled;
    const blendFrames = session.crossfadeBlendFrames || 10;
    const crossTransition = session.crossfadeTransition || 'fade';
    const crossCrf = session.crossfadeCrf ?? 18;

    console.log(`[EXPORT] session=${sessionId} clips=${clipCount} seamless=${useSeamless} blend=${blendFrames} transition=${crossTransition} crf=${crossCrf} device=${session.device} scale=${transform.scale} offset=${transform.offsetX},${transform.offsetY}`);

    if (useSeamless && clipCount === 1) {
      const clip = session.clips[0];
      const inputPath = resolveLocalPath(clip.url);
      if (!inputPath) throw new Error(`Source file not found for clip 1: ${clip.url}`);

      const totalDuration = probeDuration(inputPath);
      const blendSec = blendFrames / OUTPUT_FPS;
      console.log(`[EXPORT] single-clip: duration=${totalDuration.toFixed(4)}s blendSec=${blendSec.toFixed(4)}s`);
      if (blendSec >= totalDuration * 0.5) throw new Error('Blend too long for video duration');

      const tailStart = totalDuration - blendSec;
      const bodyEnd = totalDuration - blendSec;
      const filter = [
        `[0:v]split=3[a][b][c]`,
        `[a]trim=start=${tailStart.toFixed(4)}:end=${totalDuration.toFixed(4)},setpts=PTS-STARTPTS[tail]`,
        `[b]trim=start=0:end=${blendSec.toFixed(4)},setpts=PTS-STARTPTS[head]`,
        `[c]trim=start=${blendSec.toFixed(4)}:end=${bodyEnd.toFixed(4)},setpts=PTS-STARTPTS[body]`,
        `[tail][head]xfade=transition=${crossTransition}:duration=${blendSec.toFixed(4)}:offset=0[blend]`,
        `[blend][body]concat=n=2:v=1:a=0[looped]`,
        `[looped]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},setsar=1[sc]`,
        `color=black:s=${W}x${H}:r=60:d=999[bg]`,
        `[bg][sc]overlay=${transform.offsetX}:${transform.offsetY}:shortest=1[out]`,
      ].join('; ');

      const outputFilename = `export-${sessionId}-${Date.now()}.mp4`;
      const outputPath = join(uploadsDir, outputFilename);

      await runFfmpeg([
        '-i', inputPath,
        '-filter_complex', filter,
        '-map', '[out]',
        '-r', '60',
        '-c:v', 'libx264', '-preset', 'fast', '-crf', String(crossCrf), '-pix_fmt', 'yuv420p',
        '-an',
        '-y', outputPath,
      ]);

      const exportUrl = `/api/files/${outputFilename}`;
      finishExport(session, sessionId, userId, exportUrl, preset, W, H, transform);
      return;
    }

    for (let i = 0; i < clipCount; i++) {
      const clip = session.clips[i];
      const inputPath = resolveLocalPath(clip.url);
      if (!inputPath) throw new Error(`Source file not found for clip ${i + 1}: ${clip.url}`);

      const tempOut = join(uploadsDir, `_export_tmp_${sessionId}_${i}.mp4`);
      tempFiles.push(tempOut);
      console.log(`[EXPORT] processing clip ${i + 1}/${clipCount}: ${inputPath}`);

      const ffArgs = [
        '-i', inputPath,
        '-filter_complex',
        `[0:v]scale=${scaledW}:${scaledH}:force_original_aspect_ratio=increase,crop=${scaledW}:${scaledH},setsar=1[scaled];` +
        `color=black:s=${W}x${H}:r=60:d=999[bg];` +
        `[bg][scaled]overlay=${transform.offsetX}:${transform.offsetY}:shortest=1[out]`,
        '-map', '[out]',
        '-r', '60',
        '-c:v', 'libx264',
        '-preset', 'fast',
        '-crf', useSeamless ? String(crossCrf) : '18',
        '-pix_fmt', 'yuv420p',
      ];
      if (session.muteAudio) {
        ffArgs.push('-an');
      } else {
        ffArgs.push('-map', '0:a?', '-c:a', 'aac', '-b:a', '128k');
      }
      ffArgs.push('-y', tempOut);
      await runFfmpeg(ffArgs);
    }

    const outputFilename = `export-${sessionId}-${Date.now()}.mp4`;
    const outputPath = join(uploadsDir, outputFilename);

    if (useSeamless) {
      const concatPath = join(uploadsDir, `_export_xfade_${sessionId}.mp4`);
      tempFiles.push(concatPath);
      await xfadeConcat(tempFiles.slice(0, clipCount), concatPath, blendFrames, crossTransition, crossCrf);
      await seamlessLoop(concatPath, outputPath, blendFrames, crossTransition, crossCrf);
    } else {
      const concatListPath = join(uploadsDir, `_export_concat_${sessionId}.txt`);
      const concatContent = tempFiles.map(f => `file '${f.replace(/\\/g, '/')}'`).join('\n');
      writeFileSync(concatListPath, concatContent);
      tempFiles.push(concatListPath);

      await runFfmpeg([
        '-f', 'concat',
        '-safe', '0',
        '-i', concatListPath,
        '-c', 'copy',
        '-y',
        outputPath,
      ]);
    }

    const exportUrl = `/api/files/${outputFilename}`;
    finishExport(session, sessionId, userId, exportUrl, preset, W, H, transform);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Export failed';
    console.error(`[EXPORT] FAILED session=${sessionId}: ${msg}`);
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
