import { DEVICE_MASKS, DEVICE_PRESETS } from './models';

export interface AutofitProgress {
  stage: 'loading' | 'analyzing' | 'verifying';
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
  const SCAN_ROW_STEP = 1;
  const MIN_RUN_LENGTH = 3;

  const uniqueUrls = [...new Set(clipUrls)];
  const anchorPoints: CollectedPoint[] = [];
  const rowCenters: number[] = [];

  // Pre-scan for metadata
  const clipMeta: { url: string; duration: number; natW: number; natH: number }[] = [];

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
        clipMeta.push({ url, duration: dur, natW, natH });
      }
      video.remove();
    } catch {
      video.remove();
    }
  }

  if (clipMeta.length === 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, debug: `no_clips urls=${uniqueUrls.length}` };
  }

  const clipVideoElements: HTMLVideoElement[] = [];
  const clipVerifyTimes: number[][] = [];

  // Phase 1: Scan ONLY first frame of each clip for anchor positioning
  for (let ci = 0; ci < clipMeta.length; ci++) {
    const { url, duration, natW, natH } = clipMeta[ci];

    prog({
      stage: 'analyzing', percent: 0,
      clipIndex: ci, clipCount: clipMeta.length,
      message: `Analyzing clip ${ci + 1}/${clipMeta.length}...`,
    });

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

    // Compute verification sample times
    const sampleTimes: number[] = [];
    const count = Math.max(1, Math.ceil(duration / sampleIntervalSec));
    for (let i = 0; i < count; i++) {
      sampleTimes.push(Math.min(i * sampleIntervalSec, duration - 0.05));
    }
    if (sampleTimes[sampleTimes.length - 1] < duration - 0.3) {
      sampleTimes.push(duration - 0.1);
    }

    const VERIFY_MAX = 12;
    const vStep = Math.max(1, Math.floor(sampleTimes.length / VERIFY_MAX));
    clipVerifyTimes.push(sampleTimes.filter((_, i) => i % vStep === 0).slice(0, VERIFY_MAX));

    // Scan first frame only — for anchor positioning (head top + horizontal center)
    const SCAN_MAX = 480;
    const scanScale = Math.min(1, SCAN_MAX / Math.min(natW, natH));
    const canvasW = Math.round(natW * scanScale);
    const canvasH = Math.round(natH * scanScale);
    const expandPx = Math.max(8, Math.ceil(canvasW * 0.04));
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;

    await seekVideo(video, 0);
    ctx.drawImage(video, 0, 0, canvasW, canvasH);

    const imageData = ctx.getImageData(0, 0, canvasW, canvasH);
    const pixels = imageData.data;

    for (let row = 0; row < canvasH; row += SCAN_ROW_STEP) {
      let bestStart = -1;
      let bestLen = 0;
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
          if (runLen > bestLen) {
            bestStart = runStart;
            bestLen = runLen;
          }
          runStart = -1;
          runLen = 0;
        }
      }

      if (bestLen >= MIN_RUN_LENGTH) {
        const left = bestStart;
        const right = bestStart + bestLen - 1;
        rowCenters.push((left + right) / 2 / canvasW);
        const eL = Math.max(0, left - expandPx) / canvasW;
        const eR = Math.min(canvasW - 1, right + expandPx) / canvasW;
        anchorPoints.push({ normX: eL, normY: row / canvasH, natW, natH });
        anchorPoints.push({ normX: eR, normY: row / canvasH, natW, natH });
      }
    }

    clipVideoElements.push(video);
    canvas.remove();
  }

  let bodyCenterNorm = 0.5;
  if (rowCenters.length > 0) {
    rowCenters.sort((a, b) => a - b);
    bodyCenterNorm = rowCenters[Math.floor(rowCenters.length / 2)];
  }

  const natDims = clipMeta.map(c => `${c.natW}x${c.natH}`).join(',');
  const debugInfo = `pixel ${natDims} clips=${clipMeta.length} anchor_pts=${anchorPoints.length} bodyCenter=${bodyCenterNorm.toFixed(4)}`;

  if (anchorPoints.length === 0) {
    for (const v of clipVideoElements) v.remove();
    return { scale: 0, offsetX: 0, offsetY: 0, debug: debugInfo };
  }

  // Compute anchor bounding box
  let minNX = Infinity, maxNX = -Infinity, minNY = Infinity, maxNY = -Infinity;
  for (const p of anchorPoints) {
    if (p.normX < minNX) minNX = p.normX;
    if (p.normX > maxNX) maxNX = p.normX;
    if (p.normY < minNY) minNY = p.normY;
    if (p.normY > maxNY) maxNY = p.normY;
  }

  const maskCx = mask.circles.reduce((s, c) => s + c.cx, 0) / mask.circles.length;
  const HEAD_MARGIN_PX = 40;
  const VERIFY_SAFETY_PX = 3;
  const verifyCircles = mask.circles.map(c => ({
    cx: c.cx, cy: c.cy,
    r: Math.max(0, c.r - safetyPaddingPx - VERIFY_SAFETY_PX),
  }));
  const maskTopY = Math.min(...verifyCircles.map(c => c.cy - c.r));

  function computeOffsets(scale: number): { offsetX: number; offsetY: number } {
    const refP = anchorPoints[0];
    const elemW = device === 'solo' ? preset.width : preset.width * scale;
    const elemH = device === 'solo' ? preset.height : preset.height * scale;
    const cs = device === 'solo'
      ? Math.max(preset.width / refP.natW, preset.height / refP.natH) * scale
      : Math.max(elemW / refP.natW, elemH / refP.natH);

    let ancTopY = Infinity;
    for (const p of anchorPoints) {
      const y = p.natH * cs * (p.normY - 0.5) + elemH / 2;
      if (y < ancTopY) ancTopY = y;
    }

    const vidW = refP.natW * cs;
    const bodyXInElem = (elemW - vidW) / 2 + bodyCenterNorm * vidW;

    return {
      offsetX: Math.round(maskCx - bodyXInElem),
      offsetY: Math.round((maskTopY + HEAD_MARGIN_PX) - ancTopY),
    };
  }

  // Phase 2: Pixel-perfect mask binary search
  // Render video at computed position, erase pixels inside circles,
  // check if any body pixel remains — binary search for max scale
  if (clipVideoElements.length === 0) {
    return { scale: 0, offsetX: 0, offsetY: 0, debug: debugInfo };
  }

  const VF = 0.5;
  const VW = Math.round(preset.width * VF);
  const VH = Math.round(preset.height * VF);
  const vCanvas = document.createElement('canvas');
  vCanvas.width = VW;
  vCanvas.height = VH;
  const vCtx = vCanvas.getContext('2d')!;

  const totalVerifyFrames = clipVerifyTimes.reduce((s, t) => s + t.length, 0);

  async function maskFitsAtScale(scale: number, iteration: number, maxIter: number): Promise<boolean> {
    const { offsetX: ox, offsetY: oy } = computeOffsets(scale);
    let checkedFrames = 0;

    for (let ci = 0; ci < clipVideoElements.length; ci++) {
      const vid = clipVideoElements[ci];
      const natW = vid.videoWidth;
      const natH = vid.videoHeight;
      if (!natW || !natH) continue;

      for (const t of clipVerifyTimes[ci]) {
        await seekVideo(vid, t);
        checkedFrames++;

        const overallPct = Math.round(((iteration + checkedFrames / totalVerifyFrames) / maxIter) * 100);
        prog({
          stage: 'verifying', percent: Math.min(99, overallPct),
          message: `Verifying ${(scale * 100).toFixed(0)}% — frame ${checkedFrames}/${totalVerifyFrames} (step ${iteration + 1}/${maxIter})`,
        });

        vCtx.clearRect(0, 0, VW, VH);

        const elemW = preset.width * scale;
        const elemH = preset.height * scale;
        const cs = Math.max(elemW / natW, elemH / natH);
        const vidW = natW * cs;
        const vidH = natH * cs;
        const dx = (ox + (elemW - vidW) / 2) * VF;
        const dy = (oy + (elemH - vidH) / 2) * VF;

        vCtx.drawImage(vid, dx, dy, vidW * VF, vidH * VF);

        vCtx.globalCompositeOperation = 'destination-out';
        for (const vc of verifyCircles) {
          vCtx.beginPath();
          vCtx.arc(vc.cx * VF, vc.cy * VF, vc.r * VF, 0, Math.PI * 2);
          vCtx.fill();
        }
        vCtx.globalCompositeOperation = 'source-over';

        const imgData = vCtx.getImageData(0, 0, VW, VH);
        const px = imgData.data;
        for (let i = 0; i < px.length; i += 4) {
          if (px[i + 3] >= 200 && Math.max(px[i], px[i + 1], px[i + 2]) > PIXEL_THRESHOLD) {
            return false;
          }
        }
      }
    }
    return true;
  }

  const ITERATIONS = 20;
  let lo = 0.5;
  let hi = 3.0;
  for (let vi = 0; vi < ITERATIONS; vi++) {
    const mid = Math.round(((lo + hi) / 2) * 100) / 100;
    if (await maskFitsAtScale(mid, vi, ITERATIONS)) lo = mid;
    else hi = mid;
  }
  const resultScale = Math.floor(lo * 100) / 100;
  const resultOffsets = computeOffsets(resultScale);

  // Phase 3: Pixel-median centering refinement on rendered canvas
  const vid0 = clipVideoElements[0];
  if (vid0 && vid0.videoWidth && vid0.videoHeight) {
    await seekVideo(vid0, 0);
    const fElemW = preset.width * resultScale;
    const fElemH = preset.height * resultScale;
    const fCs = Math.max(fElemW / vid0.videoWidth, fElemH / vid0.videoHeight);
    const fVidW = vid0.videoWidth * fCs;
    const fVidH = vid0.videoHeight * fCs;
    const fDx = (resultOffsets.offsetX + (fElemW - fVidW) / 2) * VF;
    const fDy = (resultOffsets.offsetY + (fElemH - fVidH) / 2) * VF;

    vCtx.clearRect(0, 0, VW, VH);
    vCtx.drawImage(vid0, fDx, fDy, fVidW * VF, fVidH * VF);

    const fPx = vCtx.getImageData(0, 0, VW, VH).data;
    const colCounts = new Int32Array(VW);
    for (let i = 0; i < fPx.length; i += 4) {
      if (fPx[i + 3] >= 200 && Math.max(fPx[i], fPx[i + 1], fPx[i + 2]) > PIXEL_THRESHOLD) {
        colCounts[(i / 4) % VW]++;
      }
    }
    let totalPx = 0;
    for (let c = 0; c < VW; c++) totalPx += colCounts[c];
    if (totalPx > 0) {
      let cumulative = 0;
      let medianCol = VW / 2;
      for (let c = 0; c < VW; c++) {
        cumulative += colCounts[c];
        if (cumulative >= totalPx / 2) { medianCol = c; break; }
      }
      const correction = (maskCx * VF - medianCol) / VF;
      resultOffsets.offsetX += Math.round(correction);
    }
  }

  console.log('[autofit] result: scale=%s lo=%s hi=%s ox=%s bodyCenter=%s', resultScale, lo.toFixed(4), hi.toFixed(4), resultOffsets.offsetX, bodyCenterNorm.toFixed(4));

  vCanvas.remove();
  for (const v of clipVideoElements) v.remove();

  return {
    scale: resultScale,
    offsetX: resultOffsets.offsetX,
    offsetY: resultOffsets.offsetY,
    debug: `${debugInfo} scale=${resultScale}`,
  };
}
