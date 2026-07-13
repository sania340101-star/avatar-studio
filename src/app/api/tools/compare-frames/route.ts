import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getUploadsDir } from '@/lib/storage';
import { verifyToken } from '@/lib/token';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyToken(sessionCookie);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  if (!file) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large' }, { status: 413 });

  const uploadsDir = getUploadsDir();
  const ts = Date.now();
  const inputPath = join(uploadsDir, `${ts}-cmp-input.mp4`);
  const firstFrame = join(uploadsDir, `${ts}-frame-first.png`);
  const lastFrame = join(uploadsDir, `${ts}-frame-last.png`);
  const diffFrame = join(uploadsDir, `${ts}-frame-diff.png`);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(inputPath, buffer);

    const probeCmd = `ffprobe -v error -select_streams v:0 -count_frames -show_entries stream=nb_read_frames,duration,r_frame_rate -of json "${inputPath}"`;
    const probeRaw = execSync(probeCmd, { timeout: 30000 }).toString();
    const probeData = JSON.parse(probeRaw);
    const stream = probeData.streams?.[0];
    if (!stream) throw new Error('Could not read video stream info');

    const totalDuration = parseFloat(stream.duration || '0');
    const totalFrames = parseInt(stream.nb_read_frames || '0');
    const [num, den] = (stream.r_frame_rate || '30/1').split('/');
    const fps = parseInt(num) / (parseInt(den) || 1);

    execSync(`ffmpeg -y -i "${inputPath}" -vf "select=eq(n\\,0)" -frames:v 1 "${firstFrame}"`, { timeout: 15000 });

    const lastIdx = Math.max(0, totalFrames - 1);
    execSync(`ffmpeg -y -i "${inputPath}" -vf "select=eq(n\\,${lastIdx})" -frames:v 1 "${lastFrame}"`, { timeout: 15000 });

    execSync(`ffmpeg -y -i "${firstFrame}" -i "${lastFrame}" -filter_complex "blend=all_mode=difference,eq=brightness=0.5:contrast=3" "${diffFrame}"`, { timeout: 15000 });

    let psnr = 'N/A';
    try {
      const psnrOut = execSync(`ffmpeg -i "${firstFrame}" -i "${lastFrame}" -lavfi psnr -f null /dev/null 2>&1`, { timeout: 15000 }).toString();
      const m = psnrOut.match(/average:(\S+)/);
      if (m) psnr = m[1];
    } catch (e: unknown) {
      const msg = e instanceof Error ? (e as Error & { stderr?: Buffer }).stderr?.toString() || e.message : '';
      const m = msg.match(/average:(\S+)/);
      if (m) psnr = m[1];
    }

    const firstB64 = readFileSync(firstFrame).toString('base64');
    const lastB64 = readFileSync(lastFrame).toString('base64');
    const diffB64 = readFileSync(diffFrame).toString('base64');

    return NextResponse.json({
      firstFrame: `data:image/png;base64,${firstB64}`,
      lastFrame: `data:image/png;base64,${lastB64}`,
      diffFrame: `data:image/png;base64,${diffB64}`,
      psnr,
      totalFrames,
      fps: +fps.toFixed(1),
      duration: +totalDuration.toFixed(2),
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Comparison failed' }, { status: 500 });
  } finally {
    for (const f of [inputPath, firstFrame, lastFrame, diffFrame]) {
      try { if (existsSync(f)) unlinkSync(f); } catch {}
    }
  }
}
