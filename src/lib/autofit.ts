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

    const cx = (minX + maxX) / 2;
    const isFullBody = bboxH > 0.35;

    expanded.push({ normX: cx, normY: Math.max(0, minY - bboxH * 0.20), natW, natH });
    if (isFullBody) {
      // Full-body: MediaPipe often misses feet — force bottom to near frame edge
      expanded.push({ normX: cx, normY: Math.min(1, Math.max(maxY + bboxH * 0.15, 0.97)), natW, natH });
    } else {
      expanded.push({ normX: cx, normY: Math.min(1, maxY + bboxH * 0.15), natW, natH });
    }
    // Sides: clothing extends beyond wrist landmarks
    expanded.push({ normX: Math.max(0, minX - bboxW * 0.30), normY: (minY + maxY) / 2, natW, natH });
    expanded.push({ normX: Math.min(1, maxX + bboxW * 0.30), normY: (minY + maxY) / 2, natW, natH });
  }

  return expanded;
}

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 0.5,
  safetyPaddingPx = 0,
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
  const headPoints: CollectedPoint[] = [];

  // Pre-scan for progress
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
        const lms = result.landmarks[0];
        for (let li = 0; li < lms.length; li++) {
          const lm = lms[li];
          if ((lm.visibility ?? 0) > 0.5 && lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1) {
            rawPoints.push({ normX: lm.x, normY: lm.y, natW, natH });
            if (li <= 10) {
              headPoints.push({ normX: lm.x, normY: lm.y, natW, natH });
            }
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
    cx: c.cx, cy: c.cy, r: Math.max(0, c.r - safetyPaddingPx),
  }));

  const HEAD_MARGIN_PX = 20;
  const maskTopY = Math.min(...mask.circles.map(c => c.cy - c.r));
  const maskCx = mask.circles.reduce((s, c) => s + c.cx, 0) / mask.circles.length;

  // Compute crown anchor points from head landmarks (indices 0-10: nose, eyes, ears, mouth)
  const crownPoints: CollectedPoint[] = [];
  if (headPoints.length > 0) {
    const byDims = new Map<string, CollectedPoint[]>();
    for (const p of headPoints) {
      const key = `${p.natW}x${p.natH}`;
      if (!byDims.has(key)) byDims.set(key, []);
      byDims.get(key)!.push(p);
    }
    for (const [, pts] of byDims) {
      const minY = Math.min(...pts.map(p => p.normY));
      const maxY = Math.max(...pts.map(p => p.normY));
      const faceH = maxY - minY;
      const crownY = Math.max(0, minY - faceH * 0.5);
      const cx = (Math.min(...pts.map(p => p.normX)) + Math.max(...pts.map(p => p.normX))) / 2;
      crownPoints.push({ normX: cx, normY: crownY, natW: pts[0].natW, natH: pts[0].natH });
    }
  }

  function pointToContainer(p: CollectedPoint, scale: number): { x: number; y: number } {
    if (device === 'solo') {
      const cs = Math.max(preset.width / p.natW, preset.height / p.natH) * scale;
      return {
        x: p.natW * cs * (p.normX - 0.5) + preset.width / 2,
        y: p.natH * cs * (p.normY - 0.5) + preset.height / 2,
      };
    }
    const elemW = preset.width * scale;
    const elemH = preset.height * scale;
    const cs = Math.max(elemW / p.natW, elemH / p.natH);
    return {
      x: p.natW * cs * (p.normX - 0.5) + elemW / 2,
      y: p.natH * cs * (p.normY - 0.5) + elemH / 2,
    };
  }

  function tryFit(scale: number): { fits: boolean; offsetX: number; offsetY: number } {
    const pts = allPoints.map(p => pointToContainer(p, scale));

    const minX = Math.min(...pts.map(p => p.x));
    const maxX = Math.max(...pts.map(p => p.x));

    // Anchor from actual head crown, not expanded boundary points
    let anchorY: number;
    if (crownPoints.length > 0) {
      const crownPts = crownPoints.map(p => pointToContainer(p, scale));
      anchorY = Math.min(...crownPts.map(p => p.y));
    } else {
      anchorY = Math.min(...pts.map(p => p.y));
    }

    const bodyCx = (minX + maxX) / 2;
    const offsetX = Math.round(maskCx - bodyCx);
    const offsetY = Math.round((maskTopY + HEAD_MARGIN_PX) - anchorY);

    // Dead pixel constraint: face must be above first circle center
    if (headPoints.length > 0) {
      const headPtsInContainer = headPoints.map(p => {
        const cp = pointToContainer(p, scale);
        return { x: cp.x + offsetX, y: cp.y + offsetY };
      });
      const maxHeadY = Math.max(...headPtsInContainer.map(p => p.y));
      const minHeadY = Math.min(...headPtsInContainer.map(p => p.y));
      const faceH = maxHeadY - minHeadY;
      const chinY = maxHeadY + faceH * 0.3;
      if (chinY > mask.circles[0].cy - 30) {
        return { fits: false, offsetX, offsetY };
      }
    }

    let allIn = true;
    for (const p of pts) {
      const cx = offsetX + p.x;
      const cy = offsetY + p.y;
      let inside = false;
      for (const circle of paddedCircles) {
        const dist = Math.sqrt((cx - circle.cx) ** 2 + (cy - circle.cy) ** 2);
        if (dist <= circle.r) { inside = true; break; }
      }
      if (!inside) { allIn = false; break; }
    }

    return { fits: allIn, offsetX, offsetY };
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
