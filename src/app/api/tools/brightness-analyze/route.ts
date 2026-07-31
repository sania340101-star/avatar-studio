import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, unlinkSync, existsSync, copyFileSync } from 'fs';
import { join, basename } from 'path';
import { execSync } from 'child_process';
import { getUploadsDir } from '@/lib/storage';
import { verifyToken } from '@/lib/token';

const MAX_FILE_SIZE = 100 * 1024 * 1024;
const SAFE_FILENAME = /^[a-zA-Z0-9._-]+$/;
const SAMPLE_FRAMES = 12;
const THUMB_WIDTH = 320;
const BG_LOW = 10;
const BG_HIGH = 250;

interface ChannelStats {
  histogram: number[];
  median: number;
  p25: number;
  p75: number;
  darkRatio: number;
  midRatio: number;
  brightRatio: number;
}

interface AutoCoefficients {
  gamma: number;
  brightness: number;
  saturation: number;
  curves: { x1: number; y1: number; x2: number; y2: number };
}

function analyzeChannel(histogram: number[]): ChannelStats {
  let total = 0;
  const filtered = new Array(256).fill(0);
  for (let i = BG_LOW; i <= BG_HIGH; i++) {
    filtered[i] = histogram[i];
    total += histogram[i];
  }
  if (total === 0) {
    return { histogram, median: 128, p25: 64, p75: 192, darkRatio: 0, midRatio: 1, brightRatio: 0 };
  }

  let cumulative = 0;
  let median = 128, p25 = 64, p75 = 192;
  let darkCount = 0, midCount = 0, brightCount = 0;

  for (let i = BG_LOW; i <= BG_HIGH; i++) {
    cumulative += filtered[i];
    const ratio = cumulative / total;
    if (ratio >= 0.25 && p25 === 64) p25 = i;
    if (ratio >= 0.50 && median === 128) median = i;
    if (ratio >= 0.75 && p75 === 192) p75 = i;

    if (i < 80) darkCount += filtered[i];
    else if (i <= 180) midCount += filtered[i];
    else brightCount += filtered[i];
  }

  return {
    histogram,
    median,
    p25,
    p75,
    darkRatio: darkCount / total,
    midRatio: midCount / total,
    brightRatio: brightCount / total,
  };
}

function computeAutoCoefficients(r: ChannelStats, g: ChannelStats, b: ChannelStats): {
  perChannel: { r: AutoCoefficients; g: AutoCoefficients; b: AutoCoefficients };
  combined: AutoCoefficients;
} {
  function forChannel(ch: ChannelStats): AutoCoefficients {
    const gamma = Math.min(2.5, 1.0 + Math.max(0, ch.darkRatio - 0.3) * 2.0);
    const brightness = Math.max(0, Math.min(1, (140 - ch.median) / 140));
    const saturation = Math.min(1.15, 1.0 + brightness * 0.15);

    const x1 = +(0.50 - brightness * 0.20).toFixed(3);
    const y1 = +(0.50 + brightness * 0.10).toFixed(3);
    const x2 = +(0.70 - brightness * 0.05).toFixed(3);
    const y2 = +(0.70 + brightness * 0.22).toFixed(3);

    return { gamma, brightness, saturation, curves: { x1, y1, x2, y2 } };
  }

  const rc = forChannel(r);
  const gc = forChannel(g);
  const bc = forChannel(b);

  const avgMedian = (r.median + g.median + b.median) / 3;
  const avgDarkRatio = (r.darkRatio + g.darkRatio + b.darkRatio) / 3;
  const combinedBrightness = Math.max(0, Math.min(1, (140 - avgMedian) / 140));
  const combinedGamma = Math.min(2.5, 1.0 + Math.max(0, avgDarkRatio - 0.3) * 2.0);
  const combinedSaturation = Math.min(1.15, 1.0 + combinedBrightness * 0.15);

  return {
    perChannel: { r: rc, g: gc, b: bc },
    combined: {
      gamma: +combinedGamma.toFixed(3),
      brightness: +combinedBrightness.toFixed(3),
      saturation: +combinedSaturation.toFixed(3),
      curves: {
        x1: +(0.50 - combinedBrightness * 0.20).toFixed(3),
        y1: +(0.50 + combinedBrightness * 0.10).toFixed(3),
        x2: +(0.70 - combinedBrightness * 0.05).toFixed(3),
        y2: +(0.70 + combinedBrightness * 0.22).toFixed(3),
      },
    },
  };
}

export async function POST(req: NextRequest) {
  const sessionCookie = req.cookies.get('session')?.value;
  if (!sessionCookie) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const payload = await verifyToken(sessionCookie);
  if (!payload) return NextResponse.json({ error: 'Invalid session' }, { status: 401 });

  const formData = await req.formData();
  const file = formData.get('file') as File | null;
  const galleryFile = formData.get('galleryFile') as string | null;

  if (!file && !galleryFile) return NextResponse.json({ error: 'No video file provided' }, { status: 400 });
  if (file) {
    if (file.size > MAX_FILE_SIZE) return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 413 });
    if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Only video files are accepted' }, { status: 415 });
  }

  const uploadsDir = getUploadsDir();
  const ts = Date.now();
  const inputPath = join(uploadsDir, `${ts}-analyze-input.mp4`);

  try {
    if (galleryFile) {
      const safeName = basename(galleryFile);
      if (!SAFE_FILENAME.test(safeName)) return NextResponse.json({ error: 'Invalid gallery filename' }, { status: 400 });
      const srcPath = join(uploadsDir, safeName);
      if (!existsSync(srcPath)) return NextResponse.json({ error: 'Gallery file not found' }, { status: 404 });
      copyFileSync(srcPath, inputPath);
    } else {
      const buffer = Buffer.from(await file!.arrayBuffer());
      writeFileSync(inputPath, buffer);
    }

    const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=nb_frames,r_frame_rate,duration -of json "${inputPath}"`;
    const probeRaw = execSync(probeCmd, { timeout: 15000 }).toString();
    const probeData = JSON.parse(probeRaw);
    const stream = probeData.streams?.[0];
    if (!stream) throw new Error('Could not read video stream info');

    const [num, den] = (stream.r_frame_rate || '30/1').split('/');
    const fps = parseInt(num) / (parseInt(den) || 1);
    const duration = parseFloat(stream.duration || '0');
    const totalFrames = stream.nb_frames ? parseInt(stream.nb_frames) : Math.round(fps * duration);
    const step = Math.max(1, Math.floor(totalFrames / SAMPLE_FRAMES));

    const ffmpegCmd = `ffmpeg -v error -i "${inputPath}" -vf "select='not(mod(n\\,${step}))',scale=${THUMB_WIDTH}:-1" -frames:v ${SAMPLE_FRAMES} -f rawvideo -pix_fmt rgb24 pipe:1`;
    const rawBuffer = execSync(ffmpegCmd, { timeout: 60000, maxBuffer: 50 * 1024 * 1024 });

    const rHist = new Array(256).fill(0);
    const gHist = new Array(256).fill(0);
    const bHist = new Array(256).fill(0);

    for (let i = 0; i < rawBuffer.length; i += 3) {
      rHist[rawBuffer[i]]++;
      gHist[rawBuffer[i + 1]]++;
      bHist[rawBuffer[i + 2]]++;
    }

    const totalPixels = rawBuffer.length / 3;

    const rStats = analyzeChannel(rHist);
    const gStats = analyzeChannel(gHist);
    const bStats = analyzeChannel(bHist);

    const auto = computeAutoCoefficients(rStats, gStats, bStats);

    const histogramBins = 64;
    const binSize = 256 / histogramBins;
    function downsample(hist: number[]): number[] {
      const out = new Array(histogramBins).fill(0);
      for (let i = 0; i < 256; i++) out[Math.min(histogramBins - 1, Math.floor(i / binSize))] += hist[i];
      return out;
    }

    return NextResponse.json({
      ok: true,
      totalPixels,
      sampledFrames: Math.min(SAMPLE_FRAMES, Math.ceil(totalFrames / step)),
      channels: {
        r: { ...rStats, histogram: downsample(rHist) },
        g: { ...gStats, histogram: downsample(gHist) },
        b: { ...bStats, histogram: downsample(bHist) },
      },
      auto: auto.combined,
      autoPerChannel: auto.perChannel,
    });
  } catch (e: unknown) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Analysis failed' }, { status: 500 });
  } finally {
    try { if (existsSync(inputPath)) unlinkSync(inputPath); } catch {}
  }
}
