import { DEVICE_MASKS, DEVICE_PRESETS } from './models';

export interface AutofitProgress {
  stage: 'loading' | 'analyzing' | 'computing';
  clipIndex: number;
  clipCount: number;
  frameIndex: number;
  frameCount: number;
  totalFrames: number;
  processedFrames: number;
  message: string;
  percent: number;
}

export interface AutofitResult {
  scale: number;
  offsetX: number;
  offsetY: number;
}

interface CollectedPoint {
  normX: number;
  normY: number;
  natW: number;
  natH: number;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

function expandLandmarks(points: CollectedPoint[]): CollectedPoint[] {
  if (points.length === 0) return points;

  const expanded: CollectedPoint[] = [...points];

  const byDims = new Map<string, CollectedPoint[]>();
  for (const p of points) {
    const key = `${p.natW}x${p.natH}`;
    if (!byDims.has(key)) byDims.set(key, []);
    byDims.get(key)!.push(p);
  }

  for (const [, pts] of byDims) {
    const natW = pts[0].natW;
    const natH = pts[0].natH;

    const minX = Math.min(...pts.map(p => p.normX));
    const maxX = Math.max(...pts.map(p => p.normX));
    const minY = Math.min(...pts.map(p => p.normY));
    const maxY = Math.max(...pts.map(p => p.normY));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;

    // Head top: hair/hat extends well above nose landmark
    const headExtra = bboxH * 0.22;
    expanded.push({ normX: (minX + maxX) / 2, normY: Math.max(0, minY - headExtra), natW, natH });

    // Sides: jacket/clothing extends significantly beyond wrist landmarks
    const sideExtra = bboxW * 0.20;
    expanded.push({ normX: Math.max(0, minX - sideExtra), normY: (minY + maxY) / 2, natW, natH });
    expanded.push({ normX: Math.min(1, maxX + sideExtra), normY: (minY + maxY) / 2, natW, natH });

    // Bottom: shoes extend below ankle/toe landmarks
    const bottomExtra = bboxH * 0.08;
    expanded.push({ normX: (minX + maxX) / 2, normY: Math.min(1, maxY + bottomExtra), natW, natH });
  }

  return expanded;
}

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 0.5,
  safetyPadding = 0.10,
): Promise<AutofitResult | null> {
  const preset = DEVICE_PRESETS[device];
  const mask = DEVICE_MASKS[device];

  const prog = (p: Partial<AutofitProgress> & Pick<AutofitProgress, 'stage' | 'message'>) =>
    onProgress({
      clipIndex: 0, clipCount: clipUrls.length,
      frameIndex: 0, frameCount: 0,
      totalFrames: 0, processedFrames: 0, percent: 0,
      ...p,
    });

  prog({ stage: 'loading', message: 'Loading pose detection model...' });

  const { PoseLandmarker, FilesetResolver } = await import('@mediapipe/tasks-vision');

  const vision = await FilesetResolver.forVisionTasks(
    'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.35/wasm',
  );

  const landmarker = await PoseLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath:
        'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
      delegate: 'GPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  });

  const uniqueUrls = [...new Set(clipUrls)];
  const rawPoints: CollectedPoint[] = [];

  // Pre-scan: count total frames for progress percentage
  const clipMeta: { url: string; duration: number; natW: number; natH: number; frameCount: number }[] = [];
  let totalFrames = 0;

  for (const url of uniqueUrls) {
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.muted = true;
    video.playsInline = true;
    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadedmetadata = () => resolve();
        video.onerror = () => reject();
        video.src = url;
      });
      const dur = video.duration;
      const natW = video.videoWidth;
      const natH = video.videoHeight;
      if (dur && natW && natH) {
        const fc = Math.max(1, Math.ceil(dur / sampleIntervalSec)) + (dur > 0.5 ? 1 : 0);
        clipMeta.push({ url, duration: dur, natW, natH, frameCount: fc });
        totalFrames += fc;
      }
      video.remove();
    } catch {
      video.remove();
    }
  }

  if (clipMeta.length === 0) { landmarker.close(); return null; }

  let processedFrames = 0;

  for (let ci = 0; ci < clipMeta.length; ci++) {
    const { url, duration, natW, natH } = clipMeta[ci];

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.oncanplaythrough = () => resolve();
        video.onerror = () => reject();
        video.src = url;
      });
    } catch {
      video.remove();
      continue;
    }

    const sampleTimes: number[] = [];
    const count = Math.max(1, Math.ceil(duration / sampleIntervalSec));
    for (let i = 0; i < count; i++) {
      sampleTimes.push(Math.min(i * sampleIntervalSec, duration - 0.05));
    }
    if (sampleTimes[sampleTimes.length - 1] < duration - 0.3) {
      sampleTimes.push(duration - 0.1);
    }

    const canvas = document.createElement('canvas');
    canvas.width = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d')!;

    for (let fi = 0; fi < sampleTimes.length; fi++) {
      processedFrames++;
      const pct = Math.round((processedFrames / totalFrames) * 100);
      prog({
        stage: 'analyzing',
        clipIndex: ci, clipCount: clipMeta.length,
        frameIndex: fi, frameCount: sampleTimes.length,
        totalFrames, processedFrames, percent: pct,
        message: `Clip ${ci + 1}/${clipMeta.length}, frame ${fi + 1}/${sampleTimes.length}`,
      });

      await seekVideo(video, sampleTimes[fi]);
      ctx.drawImage(video, 0, 0, natW, natH);

      const result = landmarker.detect(canvas);
      if (result.landmarks && result.landmarks.length > 0) {
        for (const lm of result.landmarks[0]) {
          if ((lm.visibility ?? 0) > 0.5 && lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1) {
            rawPoints.push({ normX: lm.x, normY: lm.y, natW, natH });
          }
        }
      }
    }

    video.remove();
    canvas.remove();
  }

  landmarker.close();

  if (rawPoints.length === 0) return null;

  const allPoints = expandLandmarks(rawPoints);

  prog({ stage: 'computing', percent: 100, message: 'Computing optimal fit...' });

  const paddedCircles = mask.circles.map(c => ({
    cx: c.cx, cy: c.cy, r: c.r * (1 - safetyPadding),
  }));

  const maskCx = mask.circles.reduce((s, c) => s + c.cx, 0) / mask.circles.length;
  const maskCy = mask.circles.reduce((s, c) => s + c.cy, 0) / mask.circles.length;

  function toElemCoords(scale: number): { x: number; y: number }[] {
    const elemW = preset.width * scale;
    const elemH = preset.height * scale;
    return allPoints.map(p => {
      const cs = Math.max(elemW / p.natW, elemH / p.natH);
      return {
        x: p.natW * cs * (p.normX - 0.5) + elemW / 2,
        y: p.natH * cs * (p.normY - 0.5) + elemH / 2,
      };
    });
  }

  function tryFit(scale: number): { fits: boolean; offsetX: number; offsetY: number } {
    const elemPts = toElemCoords(scale);

    const bMinX = Math.min(...elemPts.map(p => p.x));
    const bMaxX = Math.max(...elemPts.map(p => p.x));
    const bMinY = Math.min(...elemPts.map(p => p.y));
    const bMaxY = Math.max(...elemPts.map(p => p.y));
    const bCx = (bMinX + bMaxX) / 2;
    const bCy = (bMinY + bMaxY) / 2;

    const baseOffX = maskCx - bCx;
    const baseOffY = maskCy - bCy;

    const steps = [-60, -30, -15, 0, 15, 30, 60];
    let bestMargin = -Infinity;
    let bestOx = Math.round(baseOffX);
    let bestOy = Math.round(baseOffY);
    let bestFits = false;

    for (const dy of steps) {
      for (const dx of steps) {
        const ox = baseOffX + dx;
        const oy = baseOffY + dy;
        let minMargin = Infinity;
        let allIn = true;

        for (const p of elemPts) {
          const cx = ox + p.x;
          const cy = oy + p.y;
          let bestCircleMargin = -Infinity;
          for (const circle of paddedCircles) {
            const dist = Math.sqrt((cx - circle.cx) ** 2 + (cy - circle.cy) ** 2);
            bestCircleMargin = Math.max(bestCircleMargin, circle.r - dist);
          }
          if (bestCircleMargin < 0) allIn = false;
          minMargin = Math.min(minMargin, bestCircleMargin);
        }

        if (minMargin > bestMargin) {
          bestMargin = minMargin;
          bestOx = Math.round(ox);
          bestOy = Math.round(oy);
          bestFits = allIn;
        }
      }
    }

    return { fits: bestFits, offsetX: bestOx, offsetY: bestOy };
  }

  let lo = 0.5;
  let hi = 3.0;
  let best: AutofitResult | null = null;

  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    const r = tryFit(mid);
    if (r.fits) {
      best = { scale: Math.round(mid * 100) / 100, offsetX: r.offsetX, offsetY: r.offsetY };
      lo = mid;
    } else {
      hi = mid;
    }
  }

  return best;
}
