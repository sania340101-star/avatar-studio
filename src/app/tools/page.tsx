'use client';

import { useState, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import GalleryBrowser, { GalleryItem } from '@/components/GalleryBrowser';

interface LoopStats {
  inputDuration: number;
  outputDuration: number;
  fps: number;
  blendFrames: number;
  blendSeconds: number;
  transition: string;
  crf: number;
}

interface FrameComparison {
  firstFrame: string;
  lastFrame: string;
  diffFrame: string;
  psnr: string;
  totalFrames: number;
  fps: number;
  duration: number;
}

interface BrightnessStats {
  duration: number;
  fps: number;
  width: number;
  height: number;
  preset: string;
  saturation: number;
  gamma?: number;
  crf: number;
}

const TRANSITIONS = [
  { value: 'fade', label: 'Fade' },
  { value: 'dissolve', label: 'Dissolve' },
  { value: 'wipeleft', label: 'Wipe Left' },
  { value: 'wiperight', label: 'Wipe Right' },
  { value: 'wipeup', label: 'Wipe Up' },
  { value: 'wipedown', label: 'Wipe Down' },
  { value: 'slideleft', label: 'Slide Left' },
  { value: 'slideright', label: 'Slide Right' },
  { value: 'slideup', label: 'Slide Up' },
  { value: 'slidedown', label: 'Slide Down' },
  { value: 'smoothleft', label: 'Smooth Left' },
  { value: 'smoothright', label: 'Smooth Right' },
  { value: 'circlecrop', label: 'Circle Crop' },
  { value: 'circleopen', label: 'Circle Open' },
  { value: 'circleclose', label: 'Circle Close' },
  { value: 'radial', label: 'Radial' },
  { value: 'zoomin', label: 'Zoom In' },
];

const PRESETS = [
  { value: 'mild', label: 'Mild', desc: 'Indoor, slight boost (+30%)' },
  { value: 'medium', label: 'Medium', desc: 'Bright indoor / mixed outdoor (+57%)' },
  { value: 'aggressive', label: 'Aggressive', desc: 'Direct sunlight / outdoor (+71%)' },
  { value: 'auto', label: 'Auto', desc: 'Content-aware (analyze first)' },
  { value: 'custom', label: 'Custom', desc: 'Manual brightness & saturation' },
];

interface AnalysisResult {
  totalPixels: number;
  sampledFrames: number;
  channels: {
    r: { histogram: number[]; median: number; darkRatio: number; midRatio: number; brightRatio: number };
    g: { histogram: number[]; median: number; darkRatio: number; midRatio: number; brightRatio: number };
    b: { histogram: number[]; median: number; darkRatio: number; midRatio: number; brightRatio: number };
  };
  auto: { gamma: number; brightness: number; saturation: number };
  autoPerChannel: Record<string, { gamma: number; brightness: number; saturation: number; curves: { x1: number; y1: number; x2: number; y2: number } }>;
}

function MiniHistogram({ data, color, label, median }: { data: number[]; color: string; label: string; median: number }) {
  const max = Math.max(...data);
  if (max === 0) return null;
  return (
    <div className="flex-1">
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-medium" style={{ color }}>{label}</span>
        <span className="text-xs" style={{ color: 'var(--text3)' }}>median: {median}</span>
      </div>
      <div className="flex items-end gap-px" style={{ height: 48 }}>
        {data.map((v, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: `${(v / max) * 100}%`,
              background: color,
              opacity: 0.7,
              borderRadius: '1px 1px 0 0',
            }}
          />
        ))}
      </div>
    </div>
  );
}

function SeamlessLoopTool() {
  const [file, setFile] = useState<File | null>(null);
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryName, setGalleryName] = useState('');
  const [blendFrames, setBlendFrames] = useState(10);
  const [transition, setTransition] = useState('fade');
  const [crf, setCrf] = useState(18);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [stats, setStats] = useState<LoopStats | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [showGallery, setShowGallery] = useState(false);
  const [comparing, setComparing] = useState(false);
  const [comparison, setComparison] = useState<FrameComparison | null>(null);
  const hasSource = file || galleryUrl;
  const sourceName = file ? file.name : galleryName;
  const sourceSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';

  function handleGallerySelect(items: GalleryItem[]) {
    if (!items.length) return;
    setGalleryUrl(items[0].url);
    setGalleryName(items[0].name);
    setFile(null);
    setError('');
    setResultUrl('');
    setStats(null);
    setPreviewSrc(items[0].url);
  }

  const fetchAsFile = useCallback(async (url: string): Promise<File> => {
    const res = await fetch(url);
    const blob = await res.blob();
    return new File([blob], 'gallery-video.mp4', { type: blob.type || 'video/mp4' });
  }, []);

  async function handleCompare() {
    if (!resultUrl) return;
    setComparing(true);
    setComparison(null);
    try {
      const res = await fetch(resultUrl);
      const blob = await res.blob();
      const videoFile = new File([blob], 'output.mp4', { type: 'video/mp4' });
      const fd = new FormData();
      fd.append('file', videoFile);
      const cmpRes = await fetch('/api/tools/compare-frames', { method: 'POST', body: fd });
      const data = await cmpRes.json();
      if (!cmpRes.ok) throw new Error(data.error || 'Comparison failed');
      setComparison(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Comparison failed');
    } finally {
      setComparing(false);
    }
  }

  async function handleProcess() {
    if (!hasSource) return;
    setProcessing(true);
    setError('');
    setResultUrl('');
    setStats(null);
    setComparison(null);
    try {
      const videoFile = file || await fetchAsFile(galleryUrl);
      const fd = new FormData();
      fd.append('file', videoFile);
      fd.append('blendFrames', String(blendFrames));
      fd.append('transition', transition);
      fd.append('crf', String(crf));
      const res = await fetch('/api/tools/seamless-loop', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');
      setResultUrl(data.url);
      setStats(data.stats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setGalleryUrl('');
    setGalleryName('');
    setResultUrl('');
    setStats(null);
    setError('');
    setPreviewSrc('');
    setComparison(null);
  }

  const crfLabel = crf <= 15 ? 'Very high' : crf <= 20 ? 'High' : crf <= 28 ? 'Medium' : 'Low';

  return (
    <>
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(99,102,241,0.1)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="w-5 h-5">
              <path d="M17 2l4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14" /><path d="M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Seamless Loop</h3>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>Crossfade video ends for perfect looping</p>
          </div>
        </div>

        <p className="text-sm mb-5" style={{ color: 'var(--text2)' }}>
          Blends the last N frames with the first frame using ffmpeg crossfade, creating a video that loops without visible cuts. Ideal for holographic displays.
        </p>

        {!hasSource ? (
          <button
            onClick={() => setShowGallery(true)}
            className="w-full py-8 rounded-xl border-2 border-dashed text-sm font-medium flex flex-col items-center justify-center gap-2"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
          >
            <span className="text-2xl">+</span>
            <span>Add video</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="w-4 h-4">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
                <span className="font-medium">{sourceName}</span>
                {sourceSize && <span style={{ color: 'var(--text3)' }}>({sourceSize})</span>}
                {galleryUrl && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(99,102,241,0.1)', color: 'var(--accent)' }}>Gallery</span>}
              </div>
              <button onClick={handleReset} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}>
                Clear
              </button>
            </div>

            {previewSrc && (
              <video src={previewSrc} controls loop className="w-full rounded-lg" style={{ maxHeight: 320, background: '#000' }} />
            )}

            <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Settings</p>

              <div>
                <label htmlFor="blend-frames" className="text-sm font-medium block mb-2">
                  Blend Frames: <span style={{ color: 'var(--accent)' }}>{blendFrames}</span>
                </label>
                <input
                  id="blend-frames"
                  type="range"
                  min={2}
                  max={60}
                  value={blendFrames}
                  onChange={e => setBlendFrames(parseInt(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                  <span>2 (subtle)</span>
                  <span>60 (heavy)</span>
                </div>
              </div>

              <div>
                <label htmlFor="transition" className="text-sm font-medium block mb-2">Transition</label>
                <select
                  id="transition"
                  value={transition}
                  onChange={e => setTransition(e.target.value)}
                  className="w-full rounded-lg px-3 py-2 text-sm"
                  style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', color: 'var(--text1)' }}
                >
                  {TRANSITIONS.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="crf" className="text-sm font-medium block mb-2">
                  Quality (CRF): <span style={{ color: 'var(--accent)' }}>{crf}</span>{' '}
                  <span className="font-normal text-xs" style={{ color: 'var(--text3)' }}>({crfLabel})</span>
                </label>
                <input
                  id="crf"
                  type="range"
                  min={0}
                  max={40}
                  value={crf}
                  onChange={e => setCrf(parseInt(e.target.value))}
                  className="w-full"
                  style={{ accentColor: 'var(--accent)' }}
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                  <span>0 (lossless)</span>
                  <span>40 (small file)</span>
                </div>
              </div>
            </div>

            <button
              onClick={handleProcess}
              disabled={processing}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity"
              style={{ background: 'var(--accent)', opacity: processing ? 0.6 : 1 }}
            >
              {processing ? 'Processing...' : 'Make Seamless Loop'}
            </button>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>
                {error}
              </div>
            )}

            {resultUrl && stats && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" className="w-5 h-5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>Loop created</span>
                </div>

                <video src={resultUrl} controls loop autoPlay muted className="w-full rounded-lg" style={{ maxHeight: 320, background: '#000' }} />

                <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  <div>Input: {stats.inputDuration}s</div>
                  <div>Output: {stats.outputDuration}s</div>
                  <div>FPS: {stats.fps}</div>
                  <div>Blend: {stats.blendFrames}f ({stats.blendSeconds}s)</div>
                  <div>Transition: {stats.transition}</div>
                  <div>CRF: {stats.crf}</div>
                </div>

                <div className="flex gap-2">
                  <a
                    href={resultUrl}
                    download
                    className="flex-1 block text-center py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Download
                  </a>
                  <button
                    onClick={handleCompare}
                    disabled={comparing}
                    className="flex-1 py-2 rounded-lg text-sm font-medium"
                    style={{ border: '1px solid var(--border)', color: 'var(--text2)', opacity: comparing ? 0.6 : 1 }}
                  >
                    {comparing ? 'Comparing...' : 'Compare Frames'}
                  </button>
                </div>

                {comparison && (
                  <div className="space-y-3 pt-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Frame Comparison</span>
                      <span className="text-xs px-2 py-0.5 rounded" style={{
                        background: parseFloat(comparison.psnr) > 30 ? 'rgba(76,175,80,0.1)' : parseFloat(comparison.psnr) > 20 ? 'rgba(255,152,0,0.1)' : 'rgba(239,68,68,0.1)',
                        color: parseFloat(comparison.psnr) > 30 ? 'var(--green)' : parseFloat(comparison.psnr) > 20 ? 'var(--orange, #f59e0b)' : 'var(--red)',
                      }}>
                        PSNR: {comparison.psnr} dB
                      </span>
                    </div>
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>
                      {parseFloat(comparison.psnr) > 40 ? 'Virtually identical — perfect loop' :
                       parseFloat(comparison.psnr) > 30 ? 'Very close — good loop quality' :
                       parseFloat(comparison.psnr) > 20 ? 'Noticeable difference — try more blend frames' :
                       'Significant difference — increase blend frames or try a different video'}
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <p className="text-xs mb-1 text-center" style={{ color: 'var(--text3)' }}>First Frame</p>
                        <img src={comparison.firstFrame} alt="First frame" className="w-full rounded-lg" />
                      </div>
                      <div>
                        <p className="text-xs mb-1 text-center" style={{ color: 'var(--text3)' }}>Last Frame</p>
                        <img src={comparison.lastFrame} alt="Last frame" className="w-full rounded-lg" />
                      </div>
                      <div>
                        <p className="text-xs mb-1 text-center" style={{ color: 'var(--text3)' }}>Difference</p>
                        <img src={comparison.diffFrame} alt="Difference" className="w-full rounded-lg" />
                      </div>
                    </div>
                    <div className="text-xs" style={{ color: 'var(--text3)' }}>
                      {comparison.totalFrames} frames, {comparison.fps} fps, {comparison.duration}s
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <GalleryBrowser
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={handleGallerySelect}
        accept="video"
        multiple={false}
      />
    </>
  );
}

function BrightnessBoostTool() {
  const [file, setFile] = useState<File | null>(null);
  const [galleryUrl, setGalleryUrl] = useState('');
  const [galleryName, setGalleryName] = useState('');
  const [preset, setPreset] = useState('medium');
  const [brightness, setBrightness] = useState(70);
  const [saturation, setSaturation] = useState(110);
  const [gamma, setGamma] = useState(1.0);
  const [blackThreshold, setBlackThreshold] = useState(4);
  const [crf, setCrf] = useState(1);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [stats, setStats] = useState<BrightnessStats | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const [showGallery, setShowGallery] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
  const [intensity, setIntensity] = useState(100);
  const [usePerChannel, setUsePerChannel] = useState(true);
  const hasSource = file || galleryUrl;
  const sourceName = file ? file.name : galleryName;
  const sourceSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';

  function handleGallerySelect(items: GalleryItem[]) {
    if (!items.length) return;
    setGalleryUrl(items[0].url);
    setGalleryName(items[0].name);
    setFile(null);
    setError('');
    setResultUrl('');
    setStats(null);
    setAnalysis(null);
    setPreviewSrc(items[0].url);
  }

  async function handleAnalyze() {
    if (!hasSource) return;
    setAnalyzing(true);
    setError('');
    try {
      const fd = new FormData();
      if (galleryUrl) {
        fd.append('galleryFile', galleryUrl.split('/').pop() || '');
      } else if (file) {
        fd.append('file', file);
      }
      const res = await fetch('/api/tools/brightness-analyze', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Analysis failed');
      setAnalysis(data);
      setPreset('auto');
      setIntensity(100);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  async function handleProcess() {
    if (!hasSource) return;
    setProcessing(true);
    setError('');
    setResultUrl('');
    setStats(null);
    try {
      const fd = new FormData();
      if (galleryUrl) {
        const filename = galleryUrl.split('/').pop() || '';
        fd.append('galleryFile', filename);
      } else if (file) {
        fd.append('file', file);
      }
      fd.append('preset', preset);
      fd.append('crf', String(crf));
      if (preset === 'auto' && analysis) {
        fd.append('autoCoefficients', JSON.stringify({
          combined: analysis.auto,
          perChannel: analysis.autoPerChannel,
        }));
        fd.append('intensity', String(intensity));
        if (usePerChannel) fd.append('perChannel', 'true');
      } else if (preset === 'custom') {
        fd.append('brightness', String(brightness));
        fd.append('saturation', String(saturation));
        if (gamma !== 1.0) {
          fd.append('gamma', String(gamma));
          fd.append('blackThreshold', String(blackThreshold));
        }
      }
      const res = await fetch('/api/tools/brightness-boost', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Processing failed');
      setResultUrl(data.url);
      setStats(data.stats);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Processing failed');
    } finally {
      setProcessing(false);
    }
  }

  function handleReset() {
    setFile(null);
    setGalleryUrl('');
    setGalleryName('');
    setResultUrl('');
    setStats(null);
    setError('');
    setPreviewSrc('');
    setAnalysis(null);
  }

  return (
    <>
      <div className="rounded-xl p-6" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: 'rgba(245,158,11,0.1)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="w-5 h-5">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold">Brightness Boost</h3>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>Enhance content visibility for bright environments</p>
          </div>
        </div>

        <p className="text-sm mb-5" style={{ color: 'var(--text2)' }}>
          Boosts mid-range pixel brightness while keeping black backgrounds intact. Compensates saturation and sharpness automatically. For outdoor and high-ambient-light locations.
        </p>

        {!hasSource ? (
          <button
            onClick={() => setShowGallery(true)}
            className="w-full py-8 rounded-xl border-2 border-dashed text-sm font-medium flex flex-col items-center justify-center gap-2"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
          >
            <span className="text-2xl">+</span>
            <span>Add video</span>
          </button>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <svg viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" className="w-4 h-4">
                  <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                </svg>
                <span className="font-medium">{sourceName}</span>
                {sourceSize && <span style={{ color: 'var(--text3)' }}>({sourceSize})</span>}
                {galleryUrl && <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>Gallery</span>}
              </div>
              <button onClick={handleReset} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}>
                Clear
              </button>
            </div>

            {previewSrc && (
              <video src={previewSrc} controls loop className="w-full rounded-lg" style={{ maxHeight: 320, background: '#000' }} />
            )}

            <div className="rounded-lg p-4 space-y-4" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: 'var(--text3)' }}>Settings</p>

              <div>
                <label className="text-sm font-medium block mb-2">Preset</label>
                <div className="grid grid-cols-2 gap-2">
                  {PRESETS.map(p => (
                    <button
                      key={p.value}
                      onClick={() => setPreset(p.value)}
                      className="text-left rounded-lg px-3 py-2 text-sm transition-all"
                      style={{
                        background: preset === p.value ? 'rgba(245,158,11,0.15)' : 'var(--bg-card)',
                        border: `1px solid ${preset === p.value ? '#f59e0b' : 'var(--border)'}`,
                        color: preset === p.value ? '#f59e0b' : 'var(--text2)',
                      }}
                    >
                      <div className="font-medium">{p.label}</div>
                      <div className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>{p.desc}</div>
                    </button>
                  ))}
                </div>
              </div>

              {preset === 'auto' && (
                <div className="space-y-3">
                  {!analysis ? (
                    <button
                      onClick={handleAnalyze}
                      disabled={analyzing}
                      className="w-full py-2.5 rounded-lg text-sm font-medium transition-opacity"
                      style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid #f59e0b', opacity: analyzing ? 0.6 : 1 }}
                    >
                      {analyzing ? 'Analyzing...' : 'Analyze Content'}
                    </button>
                  ) : (
                    <>
                      <div className="rounded-lg p-3" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                        <p className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: 'var(--text3)' }}>
                          RGB Histograms <span className="font-normal">({analysis.sampledFrames} frames sampled)</span>
                        </p>
                        <div className="flex gap-3">
                          <MiniHistogram data={analysis.channels.r.histogram} color="#ef4444" label="R" median={analysis.channels.r.median} />
                          <MiniHistogram data={analysis.channels.g.histogram} color="#22c55e" label="G" median={analysis.channels.g.median} />
                          <MiniHistogram data={analysis.channels.b.histogram} color="#3b82f6" label="B" median={analysis.channels.b.median} />
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div style={{ color: 'var(--text3)' }}>Gamma</div>
                          <div className="font-semibold" style={{ color: '#f59e0b' }}>{analysis.auto.gamma.toFixed(2)}</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div style={{ color: 'var(--text3)' }}>Brightness</div>
                          <div className="font-semibold" style={{ color: '#f59e0b' }}>{(analysis.auto.brightness * 100).toFixed(0)}%</div>
                        </div>
                        <div className="rounded-lg p-2 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
                          <div style={{ color: 'var(--text3)' }}>Saturation</div>
                          <div className="font-semibold" style={{ color: '#f59e0b' }}>{(analysis.auto.saturation * 100).toFixed(0)}%</div>
                        </div>
                      </div>

                      <div>
                        <label htmlFor="bb-intensity" className="text-sm font-medium block mb-2">
                          Intensity: <span style={{ color: '#f59e0b' }}>{intensity}%</span>
                        </label>
                        <input
                          id="bb-intensity"
                          type="range"
                          min={0}
                          max={200}
                          value={intensity}
                          onChange={e => setIntensity(parseInt(e.target.value))}
                          className="w-full"
                          style={{ accentColor: '#f59e0b' }}
                        />
                        <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                          <span>0% (no change)</span>
                          <span>100% (recommended)</span>
                          <span>200% (max)</span>
                        </div>
                      </div>

                      <label className="flex items-center gap-2 text-sm cursor-pointer">
                        <input
                          type="checkbox"
                          checked={usePerChannel}
                          onChange={e => setUsePerChannel(e.target.checked)}
                          style={{ accentColor: '#f59e0b' }}
                        />
                        <span style={{ color: 'var(--text2)' }}>Per-channel RGB correction</span>
                      </label>

                      <button
                        onClick={handleAnalyze}
                        disabled={analyzing}
                        className="text-xs px-3 py-1 rounded-lg"
                        style={{ color: 'var(--text3)', border: '1px solid var(--border)' }}
                      >
                        {analyzing ? 'Re-analyzing...' : 'Re-analyze'}
                      </button>
                    </>
                  )}
                </div>
              )}

              {preset === 'custom' && (
                <>
                  <div>
                    <label htmlFor="bb-brightness" className="text-sm font-medium block mb-2">
                      Brightness: <span style={{ color: '#f59e0b' }}>{brightness}%</span>
                    </label>
                    <input
                      id="bb-brightness"
                      type="range"
                      min={0}
                      max={100}
                      value={brightness}
                      onChange={e => setBrightness(parseInt(e.target.value))}
                      className="w-full"
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                      <span>0 (no change)</span>
                      <span>100 (maximum)</span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="bb-saturation" className="text-sm font-medium block mb-2">
                      Saturation: <span style={{ color: '#f59e0b' }}>{saturation}%</span>
                    </label>
                    <input
                      id="bb-saturation"
                      type="range"
                      min={50}
                      max={200}
                      value={saturation}
                      onChange={e => setSaturation(parseInt(e.target.value))}
                      className="w-full"
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                      <span>50% (desaturated)</span>
                      <span>200% (vivid)</span>
                    </div>
                  </div>

                  <div>
                    <label htmlFor="bb-gamma" className="text-sm font-medium block mb-2">
                      Gamma: <span style={{ color: '#f59e0b' }}>{gamma.toFixed(1)}</span>
                      {gamma === 1.0 && <span className="font-normal text-xs ml-1" style={{ color: 'var(--text3)' }}>(off)</span>}
                    </label>
                    <input
                      id="bb-gamma"
                      type="range"
                      min={0.5}
                      max={5.0}
                      step={0.1}
                      value={gamma}
                      onChange={e => {
                        const g = parseFloat(e.target.value);
                        setGamma(g);
                        if (g !== 1.0) setBlackThreshold(Math.round(Math.pow(0.04, 1 / g) * 100));
                      }}
                      className="w-full"
                      style={{ accentColor: '#f59e0b' }}
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                      <span>0.5 (darker)</span>
                      <span>1.0 (off)</span>
                      <span>5.0 (brighter)</span>
                    </div>
                  </div>

                  {gamma !== 1.0 && (
                    <div>
                      <label htmlFor="bb-threshold" className="text-sm font-medium block mb-2">
                        Black Threshold: <span style={{ color: '#f59e0b' }}>{blackThreshold}%</span>
                      </label>
                      <input
                        id="bb-threshold"
                        type="range"
                        min={0}
                        max={50}
                        value={blackThreshold}
                        onChange={e => setBlackThreshold(parseInt(e.target.value))}
                        className="w-full"
                        style={{ accentColor: '#f59e0b' }}
                      />
                      <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text3)' }}>
                        <span>0% (keep all)</span>
                        <span>50% (crush to black)</span>
                      </div>
                      <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                        Pixels below this brightness become pure black. Auto-adjusted with gamma.
                      </p>
                    </div>
                  )}
                </>
              )}

            </div>

            <button
              onClick={handleProcess}
              disabled={processing || (preset === 'auto' && !analysis)}
              className="w-full py-3 rounded-xl text-sm font-semibold text-white transition-opacity"
              style={{ background: '#f59e0b', opacity: (processing || (preset === 'auto' && !analysis)) ? 0.6 : 1 }}
            >
              {processing ? 'Processing...' : preset === 'auto' && !analysis ? 'Analyze first' : 'Boost Brightness'}
            </button>

            {error && (
              <div className="rounded-lg px-4 py-3 text-sm" style={{ background: 'rgba(239,68,68,0.08)', color: 'var(--red)' }}>
                {error}
              </div>
            )}

            {resultUrl && stats && (
              <div className="rounded-xl p-4 space-y-3" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--green)" strokeWidth="2" className="w-5 h-5">
                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                  </svg>
                  <span className="text-sm font-semibold" style={{ color: 'var(--green)' }}>Brightness boosted</span>
                </div>

                <video src={resultUrl} controls loop autoPlay muted className="w-full rounded-lg" style={{ maxHeight: 320, background: '#000' }} />

                <div className="grid grid-cols-2 gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  <div>Duration: {stats.duration}s</div>
                  <div>FPS: {stats.fps}</div>
                  <div>Resolution: {stats.width}x{stats.height}</div>
                  <div>Preset: {stats.preset}</div>
                  <div>Saturation: {stats.saturation}x</div>
                  <div>CRF: {stats.crf}</div>
                </div>

                <a
                  href={resultUrl}
                  download
                  className="block text-center py-2 rounded-lg text-sm font-medium"
                  style={{ background: '#f59e0b', color: '#fff' }}
                >
                  Download
                </a>
              </div>
            )}
          </div>
        )}
      </div>

      <GalleryBrowser
        open={showGallery}
        onClose={() => setShowGallery(false)}
        onSelect={handleGallerySelect}
        accept="video"
        multiple={false}
      />
    </>
  );
}

export default function ToolsPage() {
  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-2">Tools</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text2)' }}>Video post-processing utilities</p>

        <div className="space-y-6">
          <BrightnessBoostTool />
          <SeamlessLoopTool />
        </div>
      </div>
    </AppShell>
  );
}
