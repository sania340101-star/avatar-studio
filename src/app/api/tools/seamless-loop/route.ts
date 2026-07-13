import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getUploadsDir } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { verifyToken } from '@/lib/token';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const TRANSITIONS = [
  'fade', 'dissolve', 'wipeleft', 'wiperight', 'wipeup', 'wipedown',
  'slideleft', 'slideright', 'slideup', 'slidedown',
  'smoothleft', 'smoothright', 'smoothup', 'smoothdown',
  'circlecrop', 'rectcrop', 'circleopen', 'circleclose',
  'horzopen', 'horzclose', 'vertopen', 'vertclose',
  'diagbl', 'diagbr', 'diagtl', 'diagtr',
  'radial', 'zoomin',
] as const;

export async function GET() {
  return NextResponse.json({ transitions: TRANSITIONS });
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyToken(sessionCookie);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
  const userId = String(payload.userId);
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 });
  if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Only video files are accepted' }, { status: 415 });

  const blendFrames = parseInt(formData.get('blendFrames') as string) || 10;
  if (blendFrames < 2 || blendFrames > 60) return NextResponse.json({ error: 'blendFrames must be 2-60' }, { status: 400 });

  const transition = (formData.get('transition') as string) || 'fade';
  if (!TRANSITIONS.includes(transition as typeof TRANSITIONS[number])) {
    return NextResponse.json({ error: `Unknown transition. Available: ${TRANSITIONS.join(', ')}` }, { status: 400 });
  }

  const crf = parseInt(formData.get('crf') as string) || 18;
  if (crf < 0 || crf > 51) return NextResponse.json({ error: 'crf must be 0-51' }, { status: 400 });

  const uploadsDir = getUploadsDir();
  const ts = Date.now();
  const inputName = `${ts}-loop-input.mp4`;
  const outputName = `${ts}-loop-output.mp4`;
  const inputPath = join(uploadsDir, inputName);
  const outputPath = join(uploadsDir, outputName);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(inputPath, buffer);

    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,duration -of json "${inputPath}"`;
    const probeRaw = execSync(probeCmd, { timeout: 15000 }).toString();
    const probeData = JSON.parse(probeRaw);
    const stream = probeData.streams?.[0];
    if (!stream) throw new Error('Could not read video stream info');

    const [num, den] = (stream.r_frame_rate || '30/1').split('/');
    const fps = parseInt(num) / (parseInt(den) || 1);
    const totalDuration = parseFloat(stream.duration || '0');
    if (totalDuration < 0.5) throw new Error('Video too short');

    const blendSec = blendFrames / fps;
    if (blendSec >= totalDuration * 0.5) {
      return NextResponse.json({ error: `Blend duration (${blendSec.toFixed(2)}s) exceeds half the video length (${totalDuration.toFixed(2)}s). Reduce blendFrames.` }, { status: 400 });
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

    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -filter_complex "${filter}" -map "[out]" -c:v libx264 -preset fast -crf ${crf} -pix_fmt yuv420p -an "${outputPath}"`;
    execSync(ffmpegCmd, { timeout: 120000 });

    if (!existsSync(outputPath)) throw new Error('ffmpeg produced no output');

    audit({ event: 'seamless-loop', ip, userId, path: '/api/tools/seamless-loop', detail: `blend=${blendFrames} transition=${transition} crf=${crf} fps=${fps.toFixed(1)} dur=${totalDuration.toFixed(1)}s` });

    return NextResponse.json({
      url: `/api/files/${outputName}`,
      filename: outputName,
      stats: {
        inputDuration: +totalDuration.toFixed(2),
        outputDuration: +(totalDuration - blendSec).toFixed(2),
        fps: +fps.toFixed(1),
        blendFrames,
        blendSeconds: +blendSec.toFixed(2),
        transition,
        crf,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Processing failed' }, { status: 500 });
  } finally {
    try { if (existsSync(inputPath)) unlinkSync(inputPath); } catch {}
  }
}
