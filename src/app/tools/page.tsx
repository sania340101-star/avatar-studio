'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { Generation } from '@/lib/types';

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

function GalleryPicker({ onSelect, onClose }: { onSelect: (url: string, name: string) => void; onClose: () => void }) {
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch('/api/generations?type=video')
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setGenerations(data.filter(g => g.resultUrls.length > 0)); })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.5)' }}>
      <div className="rounded-2xl p-6 w-full max-w-2xl max-h-[80vh] flex flex-col" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Select from Gallery</h3>
          <button onClick={onClose} className="text-sm px-3 py-1 rounded-lg" style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}>Close</button>
        </div>
        {loading ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>Loading...</p>
        ) : generations.length === 0 ? (
          <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>No video generations found</p>
        ) : (
          <div className="overflow-y-auto grid grid-cols-3 gap-3">
            {generations.map(gen => (
              <button
                key={gen.id}
                onClick={() => onSelect(gen.resultUrls[0], gen.prompt.slice(0, 40) || gen.modelLabel)}
                className="rounded-lg overflow-hidden text-left transition-all hover:ring-2 hover:ring-[var(--accent)]"
                style={{ border: '1px solid var(--border)' }}
              >
                <video src={gen.resultUrls[0]} className="w-full aspect-video object-cover" muted />
                <div className="p-2">
                  <p className="text-xs truncate" style={{ color: 'var(--text2)' }}>{gen.prompt.slice(0, 50) || gen.modelLabel}</p>
                  <p className="text-xs" style={{ color: 'var(--text3)' }}>{gen.modelLabel}</p>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function ToolsPage() {
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
  const fileRef = useRef<HTMLInputElement>(null);

  const hasSource = file || galleryUrl;
  const sourceName = file ? file.name : galleryName;
  const sourceSize = file ? `${(file.size / 1024 / 1024).toFixed(1)} MB` : '';

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setGalleryUrl('');
    setGalleryName('');
    setError('');
    setResultUrl('');
    setStats(null);
    setPreviewSrc(URL.createObjectURL(f));
  }

  function handleGallerySelect(url: string, name: string) {
    setGalleryUrl(url);
    setGalleryName(name);
    setFile(null);
    setError('');
    setResultUrl('');
    setStats(null);
    setPreviewSrc(url);
    setShowGallery(false);
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
    if (fileRef.current) fileRef.current.value = '';
  }

  const crfLabel = crf <= 15 ? 'Very high' : crf <= 20 ? 'High' : crf <= 28 ? 'Medium' : 'Low';

  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-2">Tools</h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text2)' }}>Video post-processing utilities</p>

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
            <div className="space-y-3">
              <label
                className="flex flex-col items-center justify-center gap-3 rounded-xl p-8 cursor-pointer transition-colors"
                style={{ border: '2px dashed var(--border)', background: 'var(--bg-input)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" className="w-10 h-10">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
                </svg>
                <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Drop a video or click to upload</span>
                <span className="text-xs" style={{ color: 'var(--text3)' }}>MP4, WebM, MOV — up to 100MB</span>
                <input ref={fileRef} type="file" accept="video/*" onChange={handleFile} className="hidden" />
              </label>

              <div className="flex items-center gap-3">
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
                <span className="text-xs" style={{ color: 'var(--text3)' }}>or</span>
                <div className="flex-1 h-px" style={{ background: 'var(--border)' }} />
              </div>

              <button
                onClick={() => setShowGallery(true)}
                className="w-full py-3 rounded-xl text-sm font-medium flex items-center justify-center gap-2 transition-colors"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)', background: 'var(--bg-input)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M4 4h16v16H4z" /><path d="M4 4l8 8" /><path d="M20 4l-8 8" />
                </svg>
                Select from Gallery
              </button>
            </div>
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
      </div>

      {showGallery && <GalleryPicker onSelect={handleGallerySelect} onClose={() => setShowGallery(false)} />}
    </AppShell>
  );
}
