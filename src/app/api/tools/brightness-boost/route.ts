import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, existsSync } from 'fs';
import { join } from 'path';
import { execSync } from 'child_process';
import { getUploadsDir } from '@/lib/storage';
import { audit } from '@/lib/audit';
import { verifyToken } from '@/lib/token';

const MAX_FILE_SIZE = 100 * 1024 * 1024;

const PRESETS = {
  mild: {
    curves: "curves=master='0/0 0.06/0.06 0.5/0.65 1/1'",
    saturation: 1.2,
    unsharp: 0.3,
  },
  medium: {
    curves: "curves=master='0/0 0.06/0.06 0.35/0.60 0.70/0.90 1/1'",
    saturation: 1.4,
    unsharp: 0.5,
  },
  aggressive: {
    curves: "curves=master='0/0 0.06/0.06 0.30/0.60 0.65/0.92 1/1'",
    saturation: 1.6,
    unsharp: 0.8,
    vibrance: 0.4,
  },
} as const;

export async function GET() {
  return NextResponse.json({ presets: Object.keys(PRESETS) });
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

  const preset = (formData.get('preset') as string) || 'medium';
  if (!['mild', 'medium', 'aggressive', 'custom'].includes(preset)) {
    return NextResponse.json({ error: 'preset must be mild, medium, aggressive, or custom' }, { status: 400 });
  }

  const crf = parseInt(formData.get('crf') as string) || 18;
  if (crf < 0 || crf > 51) return NextResponse.json({ error: 'crf must be 0-51' }, { status: 400 });

  let saturation: number;
  let curvesFilter: string;
  let unsharpStrength: number;
  let vibranceIntensity: number | null = null;

  if (preset === 'custom') {
    const brightnessVal = parseFloat(formData.get('brightness') as string);
    const saturationVal = parseFloat(formData.get('saturation') as string);
    if (isNaN(brightnessVal) || brightnessVal < 0 || brightnessVal > 100) {
      return NextResponse.json({ error: 'brightness must be 0-100' }, { status: 400 });
    }
    if (isNaN(saturationVal) || saturationVal < 0 || saturationVal > 200) {
      return NextResponse.json({ error: 'saturation must be 0-200' }, { status: 400 });
    }

    saturation = saturationVal / 100;
    const b = brightnessVal / 100;
    const mid1x = (0.35 - (0.35 - 0.50) * (1 - b)).toFixed(2);
    const mid1y = (0.60 + (0.65 - 0.60) * (1 - b)).toFixed(2);
    const mid2x = (0.65 + (0.70 - 0.65) * (1 - b)).toFixed(2);
    const mid2y = (0.92 - (0.92 - 0.90) * (1 - b)).toFixed(2);
    curvesFilter = `curves=master='0/0 0.06/0.06 ${mid1x}/${mid1y} ${mid2x}/${mid2y} 1/1'`;
    unsharpStrength = 0.3 + b * 0.5;
    if (b > 0.7) vibranceIntensity = (b - 0.7) * 1.33;
  } else {
    const p = PRESETS[preset as keyof typeof PRESETS];
    curvesFilter = p.curves;
    saturation = p.saturation;
    unsharpStrength = p.unsharp;
    vibranceIntensity = 'vibrance' in p ? p.vibrance : null;
  }

  const uploadsDir = getUploadsDir();
  const ts = Date.now();
  const inputName = `${ts}-bright-input.mp4`;
  const outputName = `${ts}-bright-output.mp4`;
  const inputPath = join(uploadsDir, inputName);
  const outputPath = join(uploadsDir, outputName);

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    writeFileSync(inputPath, buffer);

    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,duration,width,height -of json "${inputPath}"`;
    const probeRaw = execSync(probeCmd, { timeout: 15000 }).toString();
    const probeData = JSON.parse(probeRaw);
    const stream = probeData.streams?.[0];
    if (!stream) throw new Error('Could not read video stream info');

    const [num, den] = (stream.r_frame_rate || '30/1').split('/');
    const fps = parseInt(num) / (parseInt(den) || 1);
    const duration = parseFloat(stream.duration || '0');
    const width = parseInt(stream.width || '0');
    const height = parseInt(stream.height || '0');

    const filterParts = [curvesFilter];
    filterParts.push(`eq=saturation=${saturation.toFixed(2)}`);
    if (vibranceIntensity !== null) {
      filterParts.push(`vibrance=intensity=${vibranceIntensity.toFixed(2)}`);
    }
    filterParts.push(`unsharp=lx=5:ly=5:la=${unsharpStrength.toFixed(1)}:cx=5:cy=5:ca=0.0`);
    const filterChain = filterParts.join(',');

    const ffmpegCmd = `ffmpeg -y -i "${inputPath}" -vf "${filterChain}" -c:v libx264 -preset fast -crf ${crf} -pix_fmt yuv420p -c:a copy "${outputPath}"`;
    execSync(ffmpegCmd, { timeout: 300000 });

    if (!existsSync(outputPath)) throw new Error('ffmpeg produced no output');

    audit({
      event: 'brightness-boost' as any,
      ip,
      userId,
      path: '/api/tools/brightness-boost',
      detail: `preset=${preset} sat=${saturation.toFixed(2)} crf=${crf} fps=${fps.toFixed(1)} dur=${duration.toFixed(1)}s ${width}x${height}`,
    });

    return NextResponse.json({
      url: `/api/files/${outputName}`,
      filename: outputName,
      stats: {
        duration: +duration.toFixed(2),
        fps: +fps.toFixed(1),
        width,
        height,
        preset,
        saturation: +saturation.toFixed(2),
        crf,
      },
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Processing failed' }, { status: 500 });
  } finally {
    try { if (existsSync(inputPath)) unlinkSync(inputPath); } catch {}
  }
}
