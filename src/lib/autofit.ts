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
  debug?: string;
}

interface CollectedPoint {
  normX: number;
  normY: number;
  natW: number;
  natH: number;
  isAnchor?: boolean;
}

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    if (Math.abs(video.currentTime - time) < 0.01) {
      resolve();
      return;
    }
    const onSeeked = () => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    };
    video.addEventListener('seeked', onSeeked);
    video.currentTime = time;
    setTimeout(() => {
      video.removeEventListener('seeked', onSeeked);
      resolve();
    }, 3000);
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

    const minY = Math.min(...pts.map(p => p.normY));
    const maxY = Math.max(...pts.map(p => p.normY));

    const refBboxH = maxY - minY;

    const cx = (Math.min(...pts.map(p => p.normX)) + Math.max(...pts.map(p => p.normX))) / 2;
    const isFullBody = refBboxH > 0.35;

    expanded.push({ normX: cx, normY: Math.max(0, minY - refBboxH * 0.20), natW, natH });
    if (isFullBody) {
      expanded.push({ normX: cx, normY: Math.min(1, Math.max(maxY + refBboxH * 0.15, 0.97)), natW, natH });
    } else {
      expanded.push({ normX: cx, normY: Math.min(1, maxY + refBboxH * 0.15), natW, natH });
    }
  }

  return expanded;
}

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 0.25,
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
      delegate: 'CPU',
    },
    runningMode: 'IMAGE',
    numPoses: 1,
  });

  const uniqueUrls = [...new Set(clipUrls)];
  const rawPoints: CollectedPoint[] = [];

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

  if (clipMeta.length === 0) {
    landmarker.close();
    return { scale: 0, offsetX: 0, offsetY: 0, debug: `no_clips urls=${uniqueUrls.length}` };
  }

  let processedFrames = 0;
  let detectOk = 0;
  let detectEmpty = 0;
  let detectErr = 0;
  let lastError = '';

  for (let ci = 0; ci < clipMeta.length; ci++) {
    const { url, duration, natW, natH } = clipMeta[ci];

    const video = document.createElement('video');
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;

    try {
      await new Promise<void>((resolve, reject) => {
        video.oncanplaythrough = () => resolve();
        video.onerror = () => reject(new Error('video load error'));
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

    const DETECT_MAX = 720;
    const detectScale = Math.min(1, DETECT_MAX / Math.min(natW, natH));
    const canvasW = Math.round(natW * detectScale);
    const canvasH = Math.round(natH * detectScale);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
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
      ctx.drawImage(video, 0, 0, canvasW, canvasH);

      try {
        const result = landmarker.detect(canvas);
        if (result.landmarks && result.landmarks.length > 0) {
          detectOk++;
          const lms = result.landmarks[0];
          for (let li = 0; li < lms.length; li++) {
            const lm = lms[li];
            if ((lm.visibility ?? 0) > 0.5 && lm.x >= 0 && lm.x <= 1 && lm.y >= 0 && lm.y <= 1) {
              rawPoints.push({ normX: lm.x, normY: lm.y, natW, natH, isAnchor: fi === 0 });
            }
          }
        } else {
          detectEmpty++;
        }
      } catch (e) {
        detectErr++;
        lastError = e instanceof Error ? e.message : String(e);
      }
    }

    video.remove();
    canvas.remove();
  }

  landmarker.close();

  const natDims = clipMeta.map(c => `${c.natW}x${c.natH}`).join(',');
  const debugInfo = `CPU ${natDims} frames=${processedFrames} ok=${detectOk} empty=${detectEmpty} err=${detectErr} pts=${rawPoints.length}` +
    (lastError ? ` last_err=${lastError}` : '');

  if (rawPoints.length === 0) return { scale: 0, offsetX: 0, offsetY: 0, debug: debugInfo } as AutofitResult & { debug: string };

  const allPoints = expandLandmarks(rawPoints);

  prog({ stage: 'computing', percent: 100, message: 'Computing optimal fit...' });

  const BODY_MARGIN_PX = 25;

  function makeCircles(bodyMargin: number) {
    return mask.circles.map(c => ({
      cx: c.cx, cy: c.cy, r: Math.max(0, c.r - safetyPaddingPx - bodyMargin),
    }));
  }

  const HEAD_MARGIN_PX = 20;
  const maskCx = mask.circles.reduce((s, c) => s + c.cx, 0) / mask.circles.length;

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

  const anchorPoints = allPoints.filter(p => p.isAnchor);

  function tryFit(scale: number, circles: { cx: number; cy: number; r: number }[]): { fits: boolean; offsetX: number; offsetY: number } {
    const maskTopY = Math.min(...circles.map(c => c.cy - c.r));
    const allPts = allPoints.map(p => pointToContainer(p, scale));

    const refPts = anchorPoints.length > 0
      ? anchorPoints.map(p => pointToContainer(p, scale))
      : allPts;

    const bodyCx = (Math.min(...refPts.map(p => p.x)) + Math.max(...refPts.map(p => p.x))) / 2;
    const offsetX = Math.round(maskCx - bodyCx);
    const globalMinY = Math.min(...allPts.map(p => p.y));
    const offsetY = Math.round((maskTopY + HEAD_MARGIN_PX) - globalMinY);

    for (const p of allPts) {
      const cx = offsetX + p.x;
      const cy = offsetY + p.y;
      let inside = false;
      for (const circle of circles) {
        const dist = Math.sqrt((cx - circle.cx) ** 2 + (cy - circle.cy) ** 2);
        if (dist <= circle.r) { inside = true; break; }
      }
      if (!inside) return { fits: false, offsetX, offsetY };
    }

    return { fits: true, offsetX, offsetY };
  }

  let best: AutofitResult | null = null;

  for (const bodyMargin of [BODY_MARGIN_PX, 0]) {
    const circles = makeCircles(bodyMargin);
    let lo = 0.5;
    let hi = 3.0;
    for (let i = 0; i < 30; i++) {
      const mid = (lo + hi) / 2;
      const r = tryFit(mid, circles);
      if (r.fits) {
        best = { scale: Math.round(mid * 100) / 100, offsetX: r.offsetX, offsetY: r.offsetY };
        lo = mid;
      } else {
        hi = mid;
      }
    }
    if (best) break;
  }

  if (!best) {
    return { scale: 0, offsetX: 0, offsetY: 0, debug: `${debugInfo} no_fit` };
  }
  best.offsetY -= 80;
  best.debug = debugInfo;
  return best;
}
