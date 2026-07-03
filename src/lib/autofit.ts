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

export async function analyzeAutofit(
  clipUrls: string[],
  device: 'hh1x3' | 'solo',
  onProgress: (p: AutofitProgress) => void,
  sampleIntervalSec = 1 / 10,
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

  prog({ stage: 'loading', message: 'Preparing video analysis...' });

  const PIXEL_THRESHOLD = 10;
  const SCAN_ROW_STEP = 2;
  const MIN_RUN_LENGTH = 3;
  const BUILTIN_SAFETY_PX = 5;

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
    return { scale: 0, offsetX: 0, offsetY: 0, debug: `no_clips urls=${uniqueUrls.length}` };
  }

  let processedFrames = 0;
  let detectOk = 0;
  let detectEmpty = 0;

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

    const SCAN_MAX = 480;
    const scanScale = Math.min(1, SCAN_MAX / Math.min(natW, natH));
    const canvasW = Math.round(natW * scanScale);
    const canvasH = Math.round(natH * scanScale);
    const expandPx = Math.max(6, Math.ceil(canvasW * 0.025));
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

      const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
      const pixels = imageData.data;
      let frameHasBody = false;

      for (let row = 0; row < canvasH; row += SCAN_ROW_STEP) {
        let leftX = -1;
        let rightX = -1;
        let runStart = -1;
        let runLen = 0;
        const rowOffset = row * canvasW * 4;

        for (let col = 0; col <= canvasW; col++) {
          let isBody = false;
          if (col < canvasW) {
            const idx = rowOffset + col * 4;
            isBody = Math.max(pixels[idx], pixels[idx + 1], pixels[idx + 2]) > PIXEL_THRESHOLD;
          }
          if (isBody) {
            if (runStart === -1) runStart = col;
            runLen++;
          } else {
            if (runLen >= MIN_RUN_LENGTH) {
              if (leftX === -1) leftX = runStart;
              rightX = runStart + runLen - 1;
            }
            runStart = -1;
            runLen = 0;
          }
        }

        if (leftX !== -1) {
          frameHasBody = true;
          const eL = Math.max(0, leftX - expandPx) / canvasW;
          const eR = Math.min(canvasW - 1, rightX + expandPx) / canvasW;
          rawPoints.push({ normX: eL, normY: row / canvasH, natW, natH, isAnchor: fi === 0 });
          rawPoints.push({ normX: eR, normY: row / canvasH, natW, natH, isAnchor: fi === 0 });
        }
      }

      if (frameHasBody) detectOk++;
      else detectEmpty++;
    }

    video.remove();
    canvas.remove();
  }

  const natDims = clipMeta.map(c => `${c.natW}x${c.natH}`).join(',');

  let minNX = Infinity, maxNX = -Infinity, minNY = Infinity, maxNY = -Infinity;
  for (const p of rawPoints) {
    if (p.normX < minNX) minNX = p.normX;
    if (p.normX > maxNX) maxNX = p.normX;
    if (p.normY < minNY) minNY = p.normY;
    if (p.normY > maxNY) maxNY = p.normY;
  }
  const boundsInfo = rawPoints.length > 0
    ? `normX=[${minNX.toFixed(3)}..${maxNX.toFixed(3)}] normY=[${minNY.toFixed(3)}..${maxNY.toFixed(3)}]`
    : 'no_points';
  const debugInfo = `pixel ${natDims} frames=${processedFrames} ok=${detectOk} empty=${detectEmpty} pts=${rawPoints.length} ${boundsInfo}`;

  if (rawPoints.length === 0) return { scale: 0, offsetX: 0, offsetY: 0, debug: debugInfo } as AutofitResult & { debug: string };

  const yExpandNorm = 0.025;
  const refNatW = clipMeta[0].natW;
  const refNatH = clipMeta[0].natH;
  rawPoints.push(
    { normX: minNX, normY: Math.max(0, minNY - yExpandNorm), natW: refNatW, natH: refNatH },
    { normX: maxNX, normY: Math.max(0, minNY - yExpandNorm), natW: refNatW, natH: refNatH },
    { normX: minNX, normY: Math.min(1, maxNY + yExpandNorm), natW: refNatW, natH: refNatH },
    { normX: maxNX, normY: Math.min(1, maxNY + yExpandNorm), natW: refNatW, natH: refNatH },
  );

  const allPoints = rawPoints;

  prog({ stage: 'computing', percent: 100, message: 'Computing optimal fit...' });

  const circles = mask.circles.map(c => ({
    cx: c.cx, cy: c.cy, r: Math.max(0, c.r - safetyPaddingPx - BUILTIN_SAFETY_PX),
  }));

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

  function minOf(arr: number[]): number {
    let m = arr[0];
    for (let i = 1; i < arr.length; i++) if (arr[i] < m) m = arr[i];
    return m;
  }
  function maxOf(arr: number[]): number {
    let m = arr[0];
    for (let i = 1; i < arr.length; i++) if (arr[i] > m) m = arr[i];
    return m;
  }

  const maskTopY = Math.min(...circles.map(c => c.cy - c.r));
  const circleRSq = circles.map(c => c.r * c.r);

  function tryFit(scale: number): { fits: boolean; offsetX: number; offsetY: number } {
    let refMinX = Infinity, refMaxX = -Infinity, globalMinY = Infinity;

    for (const p of allPoints) {
      const pt = pointToContainer(p, scale);
      if (pt.x < refMinX) refMinX = pt.x;
      if (pt.x > refMaxX) refMaxX = pt.x;
      if (pt.y < globalMinY) globalMinY = pt.y;
    }

    const offsetX = Math.round(maskCx - (refMinX + refMaxX) / 2);
    const offsetY = Math.round((maskTopY + HEAD_MARGIN_PX) - globalMinY);

    for (const p of allPoints) {
      const pt = pointToContainer(p, scale);
      const cx = offsetX + pt.x;
      const cy = offsetY + pt.y;
      let inside = false;
      for (let ci = 0; ci < circles.length; ci++) {
        const dx = cx - circles[ci].cx;
        const dy = cy - circles[ci].cy;
        if (dx * dx + dy * dy <= circleRSq[ci]) { inside = true; break; }
      }
      if (!inside) return { fits: false, offsetX, offsetY };
    }

    return { fits: true, offsetX, offsetY };
  }

  let lo = 0.5;
  let hi = 3.0;
  for (let i = 0; i < 30; i++) {
    const mid = (lo + hi) / 2;
    if (tryFit(mid).fits) lo = mid;
    else hi = mid;
  }

  const finalScale = Math.floor(lo * 100) / 100;
  const finalFit = tryFit(finalScale);

  console.log('[autofit] debug:', debugInfo);
  console.log('[autofit] binary search: lo=%s hi=%s finalScale=%s fits=%s', lo.toFixed(4), hi.toFixed(4), finalScale, finalFit.fits);
  console.log('[autofit] offset: x=%d y=%d, circles r=%d (safety=%d+%d), expandPx=2.5%%', finalFit.offsetX, finalFit.offsetY, circles[0].r, safetyPaddingPx, BUILTIN_SAFETY_PX);

  if (!finalFit.fits) {
    return { scale: 0, offsetX: 0, offsetY: 0, debug: `${debugInfo} no_fit` };
  }

  return {
    scale: finalScale,
    offsetX: finalFit.offsetX,
    offsetY: finalFit.offsetY,
    debug: debugInfo,
  };
}
