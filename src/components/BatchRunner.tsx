'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
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
  result?: { video?: { url: string }; prompt?: string; model?: string; modelLabel?: string; cost?: { amount?: number } };
  error?: string;
}

export default function BatchRunner({ template, projectId, onBack, inline, externalRefs, onComplete }: {
  template: Template;
  projectId: string;
  onBack: () => void;
  inline?: boolean;
  externalRefs?: {
    sourceImage?: string;
    sourceVideo?: TemplateRef | null;
    audioRef?: TemplateRef | null;
    endImage?: string;
  };
  onComplete?: () => void;
}) {
  const [_sourceImage, _setSourceImage] = useState('');
  const [_sourceVideo, _setSourceVideo] = useState<TemplateRef | null>(null);
  const [_audioRef, _setAudioRef] = useState<TemplateRef | null>(null);
  const [_endImage, _setEndImage] = useState('');

  const hasExternalRefs = !!externalRefs;
  const sourceImage = hasExternalRefs ? (externalRefs.sourceImage || '') : _sourceImage;
  const sourceVideo = hasExternalRefs ? (externalRefs.sourceVideo || null) : _sourceVideo;
  const audioRef = hasExternalRefs ? (externalRefs.audioRef || null) : _audioRef;
  const endImage = hasExternalRefs ? (externalRefs.endImage || '') : _endImage;
  const [running, setRunning] = useState(false);
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const savedBatchRef = useRef<string | null>(null);
  const [slotPricing, setSlotPricing] = useState<Record<string, { amount: number; unit: string }>>({});

  const slots = template.slots || [];

  const fetchPricing = useCallback(async () => {
    const uniqueModels = [...new Set(slots.map(s => s.modelId))];
    const results: Record<string, { amount: number; unit: string }> = {};
    await Promise.all(uniqueModels.map(async modelId => {
      try {
        const res = await fetch('/api/pricing', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ modelId }),
        });
        const data = await res.json();
        if (data.amount != null) {
          results[modelId] = { amount: data.amount, unit: data.details || '' };
        }
      } catch { /* ignore */ }
    }));
    setSlotPricing(results);
  }, [slots]);

  useEffect(() => { fetchPricing(); }, [fetchPricing]);

  useEffect(() => {
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

  useEffect(() => {
    if (!batchId || savedBatchRef.current === batchId) return;
    const allDone = batchJobs.length > 0 && batchJobs.every(j => j.status === 'complete' || j.status === 'error');
    if (!allDone) return;
    savedBatchRef.current = batchId;
    const completed = batchJobs.filter(j => j.status === 'complete' && j.result?.video?.url);
    const saves = completed.map(job => {
      const slot = slots[job.slotIndex ?? 0];
      return fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          type: 'video',
          modelId: job.result?.model || slot?.modelId,
          modelLabel: job.result?.modelLabel || slot?.modelLabel,
          prompt: job.result?.prompt || slot?.instruction || '',
          params: {
            templateId: template.id,
            templateName: template.name,
            slotIndex: job.slotIndex,
            instruction: slot?.instruction || '',
            duration: slot?.duration,
            aspectRatio: slot?.aspectRatio,
            quality: slot?.quality,
            fps: slot?.fps,
            strategy: slot?.strategy,
            templateDefined: true,
          },
          referenceUrls: sourceImage ? [sourceImage] : [],
          resultUrls: job.result?.video?.url ? [job.result.video.url] : [],
          status: 'completed',
          actualCost: job.result?.cost || undefined,
          batchId,
        }),
      }).catch(e => console.error('Failed to save batch result to history:', e));
    });
    Promise.all(saves).then(() => onComplete?.());
  }, [batchId, batchJobs, projectId, template, slots, sourceImage, onComplete]);

  async function handleRun() {
    setRunning(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        projectId,
        templateId: template.id,
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
      {!inline && (
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
          <div>
            <h2 className="text-xl font-semibold">{template.name}</h2>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              {slots.length} slot{slots.length !== 1 ? 's' : ''} | {template.device !== 'any' ? template.device.toUpperCase() : 'Any device'}
            </p>
          </div>
        </div>
      )}

      {!batchId && (
        <div className="space-y-5">
          {!hasExternalRefs && (
            <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text1)' }}>Source References</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>
                These are shared across all slots. Each slot also has its own references defined in the template.
              </p>
              <ImagePicker value={sourceImage} onChange={_setSourceImage} label="Source Image" />
              <ImagePicker value={endImage} onChange={_setEndImage} label="End Image (optional)" />
              <ReferenceUpload
                references={sourceVideo ? [sourceVideo] : []}
                onChange={refs => _setSourceVideo(refs[0] || null)}
                accept="video/*"
                label="Source Video (optional)"
              />
              <ReferenceUpload
                references={audioRef ? [audioRef] : []}
                onChange={refs => _setAudioRef(refs[0] || null)}
                accept="audio/*"
                label="Audio File (optional)"
              />
            </div>
          )}

          <div className="p-3 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>Slots ({slots.length})</p>
            <div className="space-y-1.5">
              {slots.map((slot, i) => {
                const imgRefs = slot.references.filter(r => r.type === 'image').length;
                const vidRefs = slot.references.filter(r => r.type === 'video').length;
                const audRefs = slot.references.filter(r => r.type === 'audio').length;
                const pricing = slotPricing[slot.modelId];
                const isPerSec = pricing && pricing.unit.includes('second');
                const slotCost = pricing ? (isPerSec ? pricing.amount * slot.duration : pricing.amount) : null;
                return (
                  <div key={slot.id} className="flex items-center gap-2 text-xs p-2 rounded-lg" style={{ background: 'var(--bg)', color: 'var(--text2)' }}>
                    <span className="font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>#{i + 1}</span>
                    <span className="font-medium truncate">{slot.modelLabel}</span>
                    <span style={{ color: 'var(--text3)' }}>{slot.duration}s</span>
                    <span style={{ color: 'var(--text3)' }}>{slot.aspectRatio}</span>
                    {imgRefs > 0 && <span style={{ color: 'var(--text3)' }}>{imgRefs} img</span>}
                    {vidRefs > 0 && <span style={{ color: 'var(--text3)' }}>{vidRefs} vid</span>}
                    {audRefs > 0 && <span style={{ color: 'var(--text3)' }}>{audRefs} aud</span>}
                    {slotCost != null && (
                      <span className="ml-auto font-medium px-1.5 py-0.5 rounded text-xs" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--green)' }}>~${slotCost.toFixed(2)}</span>
                    )}
                  </div>
                );
              })}
            </div>
            {(() => {
              let total = 0;
              let hasAll = true;
              for (const slot of slots) {
                const p = slotPricing[slot.modelId];
                if (!p) { hasAll = false; break; }
                total += p.unit.includes('second') ? p.amount * slot.duration : p.amount;
              }
              return hasAll && slots.length > 1 ? (
                <div className="flex items-center justify-between mt-2 pt-2 border-t text-xs" style={{ borderColor: 'var(--border)' }}>
                  <span style={{ color: 'var(--text3)' }}>Estimated total</span>
                  <span className="font-semibold" style={{ color: 'var(--green)' }}>~${total.toFixed(2)}</span>
                </div>
              ) : null;
            })()}
          </div>

          {error && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
              {error}
            </div>
          )}

          <button
            onClick={handleRun}
            disabled={running}
            className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: running ? 'var(--text3)' : 'var(--accent)' }}
          >
            {running ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" role="status" aria-label="Starting batch" />
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
                      <button onClick={() => setLightbox({ url: job.result!.video!.url, type: 'video' })} className="w-full cursor-zoom-in" aria-label="Preview video">
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
                    <div>
                      <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{job.error || 'Unknown error'}</p>
                      <button
                        onClick={async () => {
                          try {
                            const res = await fetch(`/api/jobs/${job.id}/retry`, { method: 'POST' });
                            if (res.ok) {
                              const updated = await res.json();
                              setBatchJobs(prev => prev.map(j => j.id === job.id ? updated : j));
                            }
                          } catch {}
                        }}
                        className="px-3 py-1 rounded text-xs font-medium text-white"
                        style={{ background: 'var(--accent)' }}
                      >
                        Retry
                      </button>
                    </div>
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

          {runningJobs.length === 0 && batchJobs.length > 0 && (
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
          <div className="absolute top-4 right-4 flex items-center gap-6 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); downloadUrl(lightbox.url, 'video.mp4'); }}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button onClick={() => setLightbox(null)} className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors" aria-label="Close">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8" aria-hidden="true">
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
