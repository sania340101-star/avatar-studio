'use client';

import { useState, useRef } from 'react';
import AppShell from '@/components/AppShell';

interface LoopStats {
  inputDuration: number;
  outputDuration: number;
  fps: number;
  blendFrames: number;
  blendSeconds: number;
}

export default function ToolsPage() {
  const [file, setFile] = useState<File | null>(null);
  const [blendFrames, setBlendFrames] = useState(10);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const [resultUrl, setResultUrl] = useState('');
  const [stats, setStats] = useState<LoopStats | null>(null);
  const [previewSrc, setPreviewSrc] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');
    setResultUrl('');
    setStats(null);
    setPreviewSrc(URL.createObjectURL(f));
  }

  async function handleProcess() {
    if (!file) return;
    setProcessing(true);
    setError('');
    setResultUrl('');
    setStats(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('blendFrames', String(blendFrames));
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
    setResultUrl('');
    setStats(null);
    setError('');
    setPreviewSrc('');
    if (fileRef.current) fileRef.current.value = '';
  }

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

          {!file ? (
            <label
              className="flex flex-col items-center justify-center gap-3 rounded-xl p-10 cursor-pointer transition-colors"
              style={{ border: '2px dashed var(--border)', background: 'var(--bg-input)' }}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" className="w-10 h-10">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Drop a video or click to upload</span>
              <span className="text-xs" style={{ color: 'var(--text3)' }}>MP4, WebM, MOV — up to 100MB</span>
              <input ref={fileRef} type="file" accept="video/*" onChange={handleFile} className="hidden" />
            </label>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <svg viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" className="w-4 h-4">
                    <polygon points="23 7 16 12 23 17 23 7" /><rect x="1" y="5" width="15" height="14" rx="2" />
                  </svg>
                  <span className="font-medium">{file.name}</span>
                  <span style={{ color: 'var(--text3)' }}>({(file.size / 1024 / 1024).toFixed(1)} MB)</span>
                </div>
                <button onClick={handleReset} className="text-xs px-3 py-1 rounded-lg" style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}>
                  Clear
                </button>
              </div>

              {previewSrc && (
                <video src={previewSrc} controls loop className="w-full rounded-lg" style={{ maxHeight: 320, background: '#000' }} />
              )}

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
                  <span>2 frames (subtle)</span>
                  <span>60 frames (heavy)</span>
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
                  </div>

                  <a
                    href={resultUrl}
                    download
                    className="block text-center w-full py-2 rounded-lg text-sm font-medium"
                    style={{ background: 'var(--accent)', color: '#fff' }}
                  >
                    Download
                  </a>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
