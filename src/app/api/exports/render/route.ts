import { NextRequest, NextResponse } from 'next/server';
import { getExportSession, updateExportSession, addGeneration, getUploadsDir } from '@/lib/storage';
import { DEVICE_PRESETS } from '@/lib/models';
import { Generation, ExportSession, ExportVersion } from '@/lib/types';
import { spawn, execSync } from 'child_process';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';

const OUTPUT_FPS = 60;

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'unknown';
}

function parseClipLabel(label: string): { startPose: string; endPose: string; type: string } | null {
  const transMatch = label.match(/\|\s*(.+?)\s*→\s*(.+?)\s*\|\s*(transition|loop)/);
  if (transMatch) return { startPose: transMatch[1].trim(), endPose: transMatch[2].trim(), type: transMatch[3] };
  const loopMatch = label.match(/\|\s*(.+?)\s*\|\s*(loop|transition)/);
  if (loopMatch) return { startPose: loopMatch[1].trim(), endPose: loopMatch[1].trim(), type: loopMatch[2] };
  return null;
}

function buildManifest(
  session: ExportSession,
  clipDurations: number[],
  blendFrames: number,
  crossfadeEnabled: boolean,
): string {
  const B = crossfadeEnabled ? blendFrames / OUTPUT_FPS : 0;
  const n = clipDurations.length;
  const offsets: { offset_ms: number; duration_ms: number }[] = [];

  if (!crossfadeEnabled || n <= 1) {
    let pos = 0;
    for (let i = 0; i < n; i++) {
      const dur = (n === 1 && crossfadeEnabled) ? clipDurations[i] - B : clipDurations[i];
      offsets.push({ offset_ms: Math.round(pos * 1000), duration_ms: Math.round(dur * 1000) });
      pos += dur;
    }
  } else {
    for (let i = 0; i < n; i++) {
      const offset = i === 0 ? 0 :
        clipDurations.slice(0, i).reduce((a, b) => a + b, 0) - i * B;
      const nextOffset = i < n - 1
        ? clipDurations.slice(0, i + 1).reduce((a, b) => a + b, 0) - (i + 1) * B
        : clipDurations.reduce((a, b) => a + b, 0) - n * B;
      offsets.push({
        offset_ms: Math.round(offset * 1000),
        duration_ms: Math.round((nextOffset - offset) * 1000),
      });
    }
  }

  const poseMap = new Map<string, { id: string; name: string }>();
  const clips: Record<string, unknown>[] = [];

  for (let i = 0; i < n; i++) {
    const clip = session.clips[i];
    const parsed = parseClipLabel(clip.label);
    const startPose = parsed ? slugify(parsed.startPose) : `clip_${i}`;
    const endPose = parsed ? slugify(parsed.endPose) : `clip_${i}`;
    const clipType = parsed?.type || 'loop';
    if (!poseMap.has(startPose)) poseMap.set(startPose, { id: startPose, name: parsed?.startPose || `Clip ${i}` });
    if (!poseMap.has(endPose)) poseMap.set(endPose, { id: endPose, name: parsed?.endPose || `Clip ${i}` });

    clips.push({
      id: `${clipType}_${startPose}${endPose !== startPose ? '_to_' + endPose : ''}_${i}`,
      file: 'master.mp4',
      start_pose: startPose,
      end_pose: endPose,
      type: clipType,
      offset_ms: offsets[i].offset_ms,
      duration_ms: offsets[i].duration_ms,
    });
  }

  const poses = Array.from(poseMap.values()).map(p => ({
    id: p.id, name: p.name, description: '', emotion: 'neutral', energy: 0.5,
  }));
  const hubPose = poses[0]?.id || 'idle';

  return JSON.stringify({
    poses,
    clips,
    emotions: [
      { id: 'neutral', name: 'Neutral', css_filter: '', overlay_color: '' },
      { id: 'happy', name: 'Happy', css_filter: 'brightness(1.08) saturate(1.2)', overlay_color: 'rgba(250, 204, 21, 0.08)' },
      { id: 'sad', name: 'Sad', css_filter: 'brightness(0.92) saturate(0.8)', overlay_color: 'rgba(96, 165, 250, 0.1)' },
      { id: 'excited', name: 'Excited', css_filter: 'brightness(1.12) saturate(1.3) contrast(1.05)', overlay_color: 'rgba(251, 146, 60, 0.1)' },
      { id: 'thoughtful', name: 'Thoughtful', css_filter: 'brightness(0.95) hue-rotate(10deg)', overlay_color: 'rgba(139, 92, 246, 0.08)' },
    ],
    settings: {
      hub_pose: hubPose,
      default_emotion: 'neutral',
      master_video: 'master.mp4',
      transition_crossfade_ms: Math.round(B * 1000),
      idle_timeout_ms: 10000,
      clips_dir: 'web/clips',
    },
  }, null, 2);
}

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
    const dur = parseFloat(raw);
    if (dur > 0) return dur;
  } catch {}
  try {
    const raw = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
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
  manifestUrl?: string,
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
  const newVersion: ExportVersion = { id: gen.id, url: exportUrl, createdAt: gen.createdAt };
  if (manifestUrl) newVersion.manifestUrl = manifestUrl;
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
    const crossTransition = session.crossfadeTransition || 'smoothleft';
    const crossCrf = Math.max(0, session.crossfadeCrf ?? 0);

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
      const manifestJson = buildManifest(session, [totalDuration], blendFrames, true);
      const manifestFilename = `manifest-${sessionId}-${Date.now()}.json`;
      writeFileSync(join(uploadsDir, manifestFilename), manifestJson);
      finishExport(session, sessionId, userId, exportUrl, preset, W, H, transform, `/api/files/${manifestFilename}`);
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

    const clipDurations: number[] = [];
    for (let i = 0; i < clipCount; i++) {
      clipDurations.push(probeDuration(tempFiles[i]));
    }
    console.log(`[EXPORT] clip durations: [${clipDurations.map(d => d.toFixed(3)).join(', ')}]`);

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
    const manifestJson = buildManifest(session, clipDurations, blendFrames, !!useSeamless);
    const manifestFilename = `manifest-${sessionId}-${Date.now()}.json`;
    writeFileSync(join(uploadsDir, manifestFilename), manifestJson);
    const manifestUrl = `/api/files/${manifestFilename}`;
    console.log(`[EXPORT] manifest saved: ${manifestFilename}`);
    finishExport(session, sessionId, userId, exportUrl, preset, W, H, transform, manifestUrl);
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
