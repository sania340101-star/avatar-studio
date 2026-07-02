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
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
  });
}

// MediaPipe landmarks don't cover body volume — only skeleton joints.
// Expand landmark positions outward from body center to approximate actual body edges.
function expandLandmarks(points: CollectedPoint[]): CollectedPoint[] {
  if (points.length === 0) return points;

  const expanded: CollectedPoint[] = [...points];

  // Group by video dimensions to compute per-frame expansion
  const byDims = new Map<string, CollectedPoint[]>();
  for (const p of points) {
    const key = `${p.natW}x${p.natH}`;
    if (!byDims.has(key)) byDims.set(key, []);
    byDims.get(key)!.push(p);
  }

  for (const [, pts] of byDims) {
    const natW = pts[0].natW;
    const natH = pts[0].natH;

    // Find bounding box in normalized coords
    const minX = Math.min(...pts.map(p => p.normX));
    const maxX = Math.max(...pts.map(p => p.normX));
    const minY = Math.min(...pts.map(p => p.normY));
    const maxY = Math.max(...pts.map(p => p.normY));
    const bboxW = maxX - minX;
    const bboxH = maxY - minY;

    // Head top: highest landmark is usually nose/eyes (~forehead level).
    // Actual head top is ~30% of face height above the nose.
    // Approximate face height as 15% of body bbox height.
    const headExtra = bboxH * 0.15;
    expanded.push({
      normX: (minX + maxX) / 2,
      normY: Math.max(0, minY - headExtra),
      natW, natH,
    });

    // Side expansion: body/clothing extends ~12% of bbox width beyond skeleton
    const sideExtra = bboxW * 0.12;
    // Left edge
    expanded.push({ normX: Math.max(0, minX - sideExtra), normY: (minY + maxY) / 2, natW, natH });
    // Right edge
    expanded.push({ normX: Math.min(1, maxX + sideExtra), normY: (minY + maxY) / 2, natW, natH });

    // Bottom expansion: shoes extend ~5% below ankle landmarks
    const bottomExtra = bboxH * 0.05;
    expanded.push({
      normX: (minX + maxX) / 2,
      normY: Math.min(1, maxY + bottomExtra),
      natW, natH,
    });
  }

  return expanded;
}

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 2,
  safetyPadding = 0.08,
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
  const rawPoints: CollectedPoint[] = [];

  for (let ci = 0; ci < uniqueUrls.length; ci++) {
    const url = uniqueUrls[ci];

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.oncanplaythrough = () => resolve();
        video.onerror = () => reject(new Error('Failed to load video'));
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

  // Expand landmarks to account for body volume beyond skeleton
  const allPoints = expandLandmarks(rawPoints);

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

    // Grid search around base offset for best margin
    const steps = [-40, -20, 0, 20, 40];
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

  // Binary search for max scale where fit works
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
