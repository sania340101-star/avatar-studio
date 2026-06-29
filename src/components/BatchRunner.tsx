'use client';

import { useState, useEffect } from 'react';
import { Template, TemplateRef } from '@/lib/types';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';

async function downloadUrl(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

interface BatchJob {
  id: string;
  status: string;
  slotIndex?: number;
  result?: { video?: { url: string }; model?: string; modelLabel?: string; cost?: { amount?: number } };
  error?: string;
}

export default function BatchRunner({ template, projectId, onBack }: {
  template: Template;
  projectId: string;
  onBack: () => void;
}) {
  const [instruction, setInstruction] = useState(template.promptTemplate || '');
  const [sourceImage, setSourceImage] = useState('');
  const [sourceVideo, setSourceVideo] = useState<TemplateRef | null>(null);
  const [audioRef, setAudioRef] = useState<TemplateRef | null>(null);
  const [endImage, setEndImage] = useState('');
  const [running, setRunning] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);

  const slots = template.slots || [];

  useEffect(() => {
    setInstruction(template.promptTemplate || '');
    setBatchId(null);
    setBatchJobs([]);
    setError('');
  }, [template.id]);

  useEffect(() => {
    if (!batchId) return;
    const allDone = batchJobs.length > 0 && batchJobs.every(j => j.status === 'complete' || j.status === 'error');
    if (allDone) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/batch?batchId=${batchId}`);
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.jobs)) setBatchJobs(data.jobs);
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(interval);
  }, [batchId, batchJobs]);

  async function handleRun() {
    setRunning(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        projectId,
        templateId: template.id,
        instruction: instruction.trim(),
      };
      if (sourceImage) body.sourceImage = sourceImage;
      if (sourceVideo) body.sourceVideo = sourceVideo.url;
      if (audioRef) body.audioUrl = audioRef.url;
      if (endImage) body.endImage = endImage;

      const res = await fetch('/api/jobs/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBatchId(data.batchId);
      setBatchJobs(data.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start batch');
    } finally {
      setRunning(false);
    }
  }

  const completedJobs = batchJobs.filter(j => j.status === 'complete');
  const errorJobs = batchJobs.filter(j => j.status === 'error');
  const runningJobs = batchJobs.filter(j => j.status !== 'complete' && j.status !== 'error');

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
        <div>
          <h2 className="text-xl font-semibold">{template.name}</h2>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            {slots.length} slot{slots.length !== 1 ? 's' : ''} | {template.device !== 'any' ? template.device.toUpperCase() : 'Any device'}
          </p>
        </div>
      </div>

      {!batchId && (
        <div className="space-y-5 max-w-2xl">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Instruction</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Describe what you want to generate..."
              className="w-full h-28 resize-none"
            />
          </div>

          <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text1)' }}>Source References</p>
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              These are shared across all slots. Each slot also has its own references defined in the template.
            </p>
            <ImagePicker value={sourceImage} onChange={setSourceImage} label="Source Image" />
            <ImagePicker value={endImage} onChange={setEndImage} label="End Image (optional)" />
            <ReferenceUpload
              references={sourceVideo ? [sourceVideo] : []}
              onChange={refs => setSourceVideo(refs[0] || null)}
              accept="video/*"
              label="Source Video (optional)"
            />
            <ReferenceUpload
              references={audioRef ? [audioRef] : []}
              onChange={refs => setAudioRef(refs[0] || null)}
              accept="audio/*"
              label="Audio File (optional)"
            />
          </div>

          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>Slots preview</p>
            <div className="space-y-1.5">
              {slots.map((slot, i) => (
                <div key={slot.id} className="flex items-center gap-2 text-xs" style={{ color: 'var(--text2)' }}>
                  <span className="font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>#{i + 1}</span>
                  <span className="truncate">{slot.modelLabel}</span>
                  <span style={{ color: 'var(--text3)' }}>{slot.duration}s</span>
                  {slot.references.length > 0 && <span style={{ color: 'var(--text3)' }}>{slot.references.length} refs</span>}
                </div>
              ))}
            </div>
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={running || !instruction.trim()}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: running ? 'var(--text3)' : 'var(--accent)' }}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Starting batch...
              </span>
            ) : `Generate ${slots.length} Video${slots.length !== 1 ? 's' : ''}`}
          </button>
        </div>
      )}

      {batchId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
              Progress: {completedJobs.length}/{batchJobs.length} complete
              {errorJobs.length > 0 && `, ${errorJobs.length} failed`}
            </span>
            {runningJobs.length > 0 && (
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            )}
          </div>

          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{
                width: `${batchJobs.length > 0 ? (completedJobs.length / batchJobs.length) * 100 : 0}%`,
                background: errorJobs.length > 0 ? '#f59e0b' : 'var(--accent)',
              }}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {batchJobs.map((job, i) => {
              const slot = slots[job.slotIndex ?? i];
              return (
                <div key={job.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      #{(job.slotIndex ?? i) + 1}
                    </span>
                    <span className="text-sm truncate" style={{ color: 'var(--text1)' }}>{slot?.modelLabel || 'Unknown'}</span>
                    <span className="ml-auto text-xs px-2 py-0.5 rounded font-medium" style={{
                      background: job.status === 'complete' ? 'rgba(76,175,80,0.15)' : job.status === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(108,60,224,0.1)',
                      color: job.status === 'complete' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--accent)',
                    }}>
                      {job.status === 'complete' ? 'Done' : job.status === 'error' ? 'Failed' : 'Generating...'}
                    </span>
                  </div>

                  {job.status === 'complete' && job.result?.video?.url && (
                    <div className="relative group rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => setLightbox({ url: job.result!.video!.url, type: 'video' })} className="w-full cursor-zoom-in">
                        <video src={job.result.video.url} className="w-full pointer-events-none" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center p-2 pointer-events-none">
                        <button
                          onClick={(e) => { e.stopPropagation(); downloadUrl(job.result!.video!.url, `slot-${(job.slotIndex ?? i) + 1}.mp4`); }}
                          className="pointer-events-auto px-3 py-1 rounded text-xs text-white font-medium"
                          style={{ background: 'var(--accent)' }}
                        >
                          Download
                        </button>
                      </div>
                    </div>
                  )}

                  {job.status === 'error' && (
                    <p className="text-xs" style={{ color: 'var(--red)' }}>{job.error || 'Unknown error'}</p>
                  )}

                  {job.status !== 'complete' && job.status !== 'error' && (
                    <div className="flex items-center justify-center py-8">
                      <span className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                    </div>
                  )}

                  {job.result?.cost?.amount != null && (
                    <div className="mt-2 text-xs text-right" style={{ color: 'var(--text3)' }}>
                      ${job.result.cost.amount.toFixed(3)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {completedJobs.length === batchJobs.length && batchJobs.length > 0 && (
            <button
              onClick={() => { setBatchId(null); setBatchJobs([]); }}
              className="w-full py-2.5 rounded-lg text-sm font-medium"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              Run Again
            </button>
          )}
        </div>
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setLightbox(null)}
        >
          <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); downloadUrl(lightbox.url, 'video.mp4'); }}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button onClick={() => setLightbox(null)} className="text-white/70 hover:text-white transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <video src={lightbox.url} className="max-w-full max-h-[90vh] object-contain rounded-lg" controls autoPlay />
          </div>
        </div>
      )}
    </>
  );
}
