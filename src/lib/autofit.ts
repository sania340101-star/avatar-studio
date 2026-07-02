import { DEVICE_MASKS, DEVICE_PRESETS } from './models';

export interface AutofitProgress {
  stage: 'loading' | 'analyzing' | 'computing';
  clipIndex: number;
  clipCount: number;
  frameIndex: number;
  frameCount: number;
  message: string;
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
    video.onseeked = () => resolve();
    video.currentTime = time;
  });
}

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 2,
  safetyPadding = 0.05,
): Promise<AutofitResult | null> {
  const preset = DEVICE_PRESETS[device];
  const mask = DEVICE_MASKS[device];

  onProgress({
    stage: 'loading', clipIndex: 0, clipCount: clipUrls.length,
    frameIndex: 0, frameCount: 0,
    message: 'Loading pose detection model...',
  });

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
  const allPoints: CollectedPoint[] = [];

  for (let ci = 0; ci < uniqueUrls.length; ci++) {
    const url = uniqueUrls[ci];

    const video = document.createElement('video');
    video.crossOrigin = 'anonymous';
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.onloadeddata = () => resolve();
        video.onerror = () => reject(new Error(`Failed to load video`));
        video.src = url;
      });
    } catch {
      continue;
    }

    const duration = video.duration;
    const natW = video.videoWidth;
    const natH = video.videoHeight;
    if (!duration || !natW || !natH) { video.remove(); continue; }

    const sampleTimes: number[] = [];
    const count = Math.max(1, Math.ceil(duration / sampleIntervalSec));
    for (let i = 0; i < count; i++) {
      sampleTimes.push(Math.min(i * sampleIntervalSec, duration - 0.1));
    }
    if (sampleTimes[sampleTimes.length - 1] < duration - 0.5) {
      sampleTimes.push(duration - 0.3);
    }

    const canvas = document.createElement('canvas');
    canvas.width = natW;
    canvas.height = natH;
    const ctx = canvas.getContext('2d')!;

    for (let fi = 0; fi < sampleTimes.length; fi++) {
      onProgress({
        stage: 'analyzing', clipIndex: ci, clipCount: uniqueUrls.length,
        frameIndex: fi, frameCount: sampleTimes.length,
        message: `Clip ${ci + 1}/${uniqueUrls.length}, frame ${fi + 1}/${sampleTimes.length}`,
      });

      await seekVideo(video, sampleTimes[fi]);
      ctx.drawImage(video, 0, 0, natW, natH);

      const result = landmarker.detect(canvas);
      if (result.landmarks && result.landmarks.length > 0) {
        for (const lm of result.landmarks[0]) {
          if ((lm.visibility ?? 0) > 0.3) {
            allPoints.push({ normX: lm.x, normY: lm.y, natW, natH });
          }
        }
      }
    }

    video.remove();
    canvas.remove();
  }

  landmarker.close();

  if (allPoints.length === 0) return null;

  onProgress({
    stage: 'computing', clipIndex: uniqueUrls.length, clipCount: uniqueUrls.length,
    frameIndex: 0, frameCount: 0,
    message: 'Computing optimal fit...',
  });

  const paddedCircles = mask.circles.map(c => ({
    cx: c.cx, cy: c.cy, r: c.r * (1 - safetyPadding),
  }));

  const maskCx = mask.circles.reduce((s, c) => s + c.cx, 0) / mask.circles.length;
  const maskCy = mask.circles.reduce((s, c) => s + c.cy, 0) / mask.circles.length;

  function tryFit(scale: number): { fits: boolean; offsetX: number; offsetY: number } {
    const elemW = preset.width * scale;
    const elemH = preset.height * scale;

    const elemPts: { x: number; y: number }[] = [];
    for (const p of allPoints) {
      const cs = Math.max(elemW / p.natW, elemH / p.natH);
      const sw = p.natW * cs;
      const sh = p.natH * cs;
      elemPts.push({
        x: sw * (p.normX - 0.5) + elemW / 2,
        y: sh * (p.normY - 0.5) + elemH / 2,
      });
    }

    const bMinX = Math.min(...elemPts.map(p => p.x));
    const bMaxX = Math.max(...elemPts.map(p => p.x));
    const bMinY = Math.min(...elemPts.map(p => p.y));
    const bMaxY = Math.max(...elemPts.map(p => p.y));
    const bCx = (bMinX + bMaxX) / 2;
    const bCy = (bMinY + bMaxY) / 2;

    const baseOffX = maskCx - bCx;
    const baseOffY = maskCy - bCy;

    // Try base offset + small adjustments to find best margin
    const offsets = [
      [baseOffX, baseOffY],
      [baseOffX, baseOffY - 30],
      [baseOffX, baseOffY + 30],
      [baseOffX - 20, baseOffY],
      [baseOffX + 20, baseOffY],
    ];

    let bestMargin = -Infinity;
    let bestOx = Math.round(baseOffX);
    let bestOy = Math.round(baseOffY);
    let bestFits = false;

    for (const [ox, oy] of offsets) {
      let minMargin = Infinity;
      let allIn = true;

      for (const p of elemPts) {
        const cx = ox + p.x;
        const cy = oy + p.y;

        let bestCircleMargin = -Infinity;
        for (const circle of paddedCircles) {
          const dist = Math.sqrt((cx - circle.cx) ** 2 + (cy - circle.cy) ** 2);
          const margin = circle.r - dist;
          if (margin > bestCircleMargin) bestCircleMargin = margin;
        }
        if (bestCircleMargin < 0) allIn = false;
        if (bestCircleMargin < minMargin) minMargin = bestCircleMargin;
      }

      if (minMargin > bestMargin) {
        bestMargin = minMargin;
        bestOx = Math.round(ox);
        bestOy = Math.round(oy);
        bestFits = allIn;
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
