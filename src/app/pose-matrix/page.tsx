'use client';

import { useState, useEffect, useCallback } from 'react';
import { PoseMatrix, PoseMatrixPose, PoseMatrixClip, VideoModelOption } from '@/lib/types';
import { VIDEO_MODELS } from '@/lib/models';
import ImagePicker from '@/components/ImagePicker';

interface BatchJob {
  id: string;
  status: string;
  slotIndex?: number;
  input?: Record<string, unknown>;
  result?: { video?: { url: string }; prompt?: string; model?: string; modelLabel?: string; cost?: { amount?: number } };
  error?: string;
}

const START_END_MODELS = VIDEO_MODELS.filter(m => m.startEndFrame);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

export default function PoseMatrixPage() {
  const [matrices, setMatrices] = useState<PoseMatrix[]>([]);
  const [active, setActive] = useState<PoseMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [batchId, setBatchId] = useState<string | null>(null);
  const [batchJobs, setBatchJobs] = useState<BatchJob[]>([]);
  const [generating, setGenerating] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/pose-matrix');
    if (res.ok) setMatrices(await res.json());
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  async function createMatrix() {
    const res = await fetch('/api/pose-matrix', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'New Pose Matrix',
        modelId: START_END_MODELS[0]?.id || '',
        modelLabel: START_END_MODELS[0]?.label || '',
      }),
    });
    if (res.ok) {
      const m = await res.json();
      setMatrices(prev => [m, ...prev]);
      setActive(m);
    }
  }

  async function save(updates: Partial<PoseMatrix>) {
    if (!active) return;
    setSaving(true);
    const res = await fetch('/api/pose-matrix', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: active.id, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      setActive(updated);
      setMatrices(prev => prev.map(m => m.id === updated.id ? updated : m));
    }
    setSaving(false);
  }

  async function deleteMatrix(id: string) {
    await fetch(`/api/pose-matrix?id=${id}`, { method: 'DELETE' });
    setMatrices(prev => prev.filter(m => m.id !== id));
    if (active?.id === id) setActive(null);
  }

  function addPose() {
    if (!active) return;
    const poses = [...active.poses, { id: uid(), name: `Pose ${active.poses.length + 1}`, imageUrl: '' }];
    setActive({ ...active, poses });
    save({ poses });
  }

  function updatePose(poseId: string, updates: Partial<PoseMatrixPose>) {
    if (!active) return;
    const poses = active.poses.map(p => p.id === poseId ? { ...p, ...updates } : p);
    setActive({ ...active, poses });
    save({ poses });
  }

  function removePose(poseId: string) {
    if (!active) return;
    const poses = active.poses.filter(p => p.id !== poseId);
    const clips = active.clips.filter(c => c.startPoseId !== poseId && c.endPoseId !== poseId);
    setActive({ ...active, poses, clips });
    save({ poses, clips });
  }

  function addClip(startPoseId: string, endPoseId: string) {
    if (!active) return;
    const clips = [...active.clips, { id: uid(), startPoseId, endPoseId, prompt: '' }];
    setActive({ ...active, clips });
    save({ clips });
  }

  function updateClip(clipId: string, updates: Partial<PoseMatrixClip>) {
    if (!active) return;
    const clips = active.clips.map(c => c.id === clipId ? { ...c, ...updates } : c);
    setActive({ ...active, clips });
    save({ clips });
  }

  function removeClip(clipId: string) {
    if (!active) return;
    const clips = active.clips.filter(c => c.id !== clipId);
    setActive({ ...active, clips });
    save({ clips });
  }

  function addAllTransitions() {
    if (!active || active.poses.length < 2) return;
    const existing = new Set(active.clips.map(c => `${c.startPoseId}→${c.endPoseId}`));
    const newClips: PoseMatrixClip[] = [];
    for (const a of active.poses) {
      for (const b of active.poses) {
        if (a.id === b.id) continue;
        const key = `${a.id}→${b.id}`;
        if (!existing.has(key)) {
          newClips.push({ id: uid(), startPoseId: a.id, endPoseId: b.id, prompt: `Smooth transition from ${a.name} to ${b.name}` });
        }
      }
    }
    if (newClips.length > 0) {
      const clips = [...active.clips, ...newClips];
      setActive({ ...active, clips });
      save({ clips });
    }
  }

  async function handleGenerate() {
    if (!active) return;
    setGenerating(true);
    setError('');
    setBatchId(null);
    setBatchJobs([]);
    try {
      const res = await fetch(`/api/pose-matrix/${active.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: 'pose-matrix' }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBatchId(data.batchId);
      setBatchJobs(data.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  useEffect(() => {
    if (!batchId) return;
    const allDone = batchJobs.length > 0 && batchJobs.every(j => j.status === 'complete' || j.status === 'error');
    if (allDone) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/batch?batchId=${batchId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.jobs)) setBatchJobs(data.jobs);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [batchId, batchJobs]);

  const poseMap = new Map(active?.poses.map(p => [p.id, p]) || []);
  const loops = active?.clips.filter(c => c.startPoseId === c.endPoseId) || [];
  const transitions = active?.clips.filter(c => c.startPoseId !== c.endPoseId) || [];
  const completedJobs = batchJobs.filter(j => j.status === 'complete');
  const errorJobs = batchJobs.filter(j => j.status === 'error');
  const runningJobs = batchJobs.filter(j => j.status !== 'complete' && j.status !== 'error');

  if (!active) {
    return (
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Pose Matrix</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>Generate loops and transitions between poses using start-end frame models.</p>
          </div>
          <button onClick={createMatrix} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
            + New Matrix
          </button>
        </div>
        {matrices.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--text3)' }}>
            <p className="text-lg mb-2">No pose matrices yet</p>
            <p className="text-sm">Create one to start generating pose-based video clips.</p>
          </div>
        )}
        <div className="space-y-2">
          {matrices.map(m => (
            <div key={m.id} className="flex items-center gap-3 p-4 rounded-xl cursor-pointer hover:opacity-80" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
              onClick={() => setActive(m)}>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{m.name}</p>
                <p className="text-xs" style={{ color: 'var(--text3)' }}>{m.poses.length} poses · {m.clips.length} clips · {m.modelLabel || 'No model'}</p>
              </div>
              <button onClick={e => { e.stopPropagation(); deleteMatrix(m.id); }} className="text-xs px-2 py-1 rounded" style={{ color: 'var(--red)' }}>Delete</button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => { setActive(null); setBatchId(null); setBatchJobs([]); }} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
        <input
          value={active.name}
          onChange={e => { setActive({ ...active, name: e.target.value }); save({ name: e.target.value }); }}
          className="text-xl font-bold bg-transparent border-none outline-none flex-1"
          style={{ color: 'var(--text1)' }}
        />
        {saving && <span className="text-xs" style={{ color: 'var(--text3)' }}>Saving...</span>}
      </div>

      {/* Model & params */}
      <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium mb-3">Model & Parameters</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text3)' }}>Model</label>
            <select value={active.modelId} onChange={e => {
              const m = START_END_MODELS.find(m => m.id === e.target.value);
              setActive({ ...active, modelId: e.target.value, modelLabel: m?.label || '' });
              save({ modelId: e.target.value, modelLabel: m?.label || '' });
            }} className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              {START_END_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text3)' }}>Duration (s)</label>
            <input type="number" min={1} max={30} value={active.duration} onChange={e => {
              const duration = parseInt(e.target.value) || 5;
              setActive({ ...active, duration });
              save({ duration });
            }} className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }} />
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text3)' }}>Aspect Ratio</label>
            <select value={active.aspectRatio} onChange={e => { setActive({ ...active, aspectRatio: e.target.value }); save({ aspectRatio: e.target.value }); }}
              className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              <option value="9:16">9:16</option>
              <option value="16:9">16:9</option>
              <option value="1:1">1:1</option>
              <option value="4:3">4:3</option>
              <option value="3:4">3:4</option>
            </select>
          </div>
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text3)' }}>Quality</label>
            <select value={active.quality} onChange={e => { setActive({ ...active, quality: e.target.value }); save({ quality: e.target.value }); }}
              className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              <option value="high">High</option>
              <option value="standard">Standard</option>
            </select>
          </div>
        </div>
      </div>

      {/* Poses */}
      <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Poses ({active.poses.length})</p>
          <button onClick={addPose} className="text-xs px-3 py-1 rounded font-medium text-white" style={{ background: 'var(--accent)' }}>+ Add Pose</button>
        </div>
        {active.poses.length === 0 && (
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text3)' }}>Add keyframe poses (images) to get started.</p>
        )}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {active.poses.map(pose => (
            <div key={pose.id} className="rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1 mb-2">
                <input value={pose.name} onChange={e => updatePose(pose.id, { name: e.target.value })}
                  className="text-xs font-medium bg-transparent border-none outline-none flex-1 min-w-0" style={{ color: 'var(--text1)' }} />
                <button onClick={() => removePose(pose.id)} className="text-xs shrink-0" style={{ color: 'var(--red)' }}>×</button>
              </div>
              {pose.imageUrl ? (
                <div className="relative group">
                  <img src={pose.imageUrl} alt={pose.name} className="w-full aspect-[3/4] object-cover rounded" />
                  <button onClick={() => updatePose(pose.id, { imageUrl: '' })}
                    className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/50 text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">×</button>
                </div>
              ) : (
                <ImagePicker value="" onChange={url => updatePose(pose.id, { imageUrl: url })} label="" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Clips */}
      <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-sm font-medium">Clips ({active.clips.length})</p>
          <div className="flex gap-2">
            {active.poses.length >= 2 && (
              <button onClick={addAllTransitions} className="text-xs px-3 py-1 rounded font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
                + All Transitions
              </button>
            )}
          </div>
        </div>

        {/* Loops section */}
        {loops.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>Loops (same start/end)</p>
            <div className="space-y-2">
              {loops.map(clip => {
                const pose = poseMap.get(clip.startPoseId);
                return (
                  <div key={clip.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <span className="text-xs font-medium px-2 py-0.5 rounded shrink-0 mt-1" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      {pose?.name || '?'} → {pose?.name || '?'}
                    </span>
                    <input value={clip.prompt} onChange={e => updateClip(clip.id, { prompt: e.target.value })} placeholder="Prompt..."
                      className="flex-1 text-xs px-2 py-1 rounded bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text1)' }} />
                    <button onClick={() => removeClip(clip.id)} className="text-xs shrink-0 mt-1" style={{ color: 'var(--red)' }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Transitions section */}
        {transitions.length > 0 && (
          <div className="mb-4">
            <p className="text-xs font-medium mb-2" style={{ color: 'var(--text3)' }}>Transitions (different start/end)</p>
            <div className="space-y-2">
              {transitions.map(clip => {
                const start = poseMap.get(clip.startPoseId);
                const end = poseMap.get(clip.endPoseId);
                return (
                  <div key={clip.id} className="flex items-start gap-2 p-2 rounded-lg" style={{ background: 'var(--bg)' }}>
                    <span className="text-xs font-medium px-2 py-0.5 rounded shrink-0 mt-1" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--green)' }}>
                      {start?.name || '?'} → {end?.name || '?'}
                    </span>
                    <input value={clip.prompt} onChange={e => updateClip(clip.id, { prompt: e.target.value })} placeholder="Prompt..."
                      className="flex-1 text-xs px-2 py-1 rounded bg-transparent outline-none" style={{ border: '1px solid var(--border)', color: 'var(--text1)' }} />
                    <button onClick={() => removeClip(clip.id)} className="text-xs shrink-0 mt-1" style={{ color: 'var(--red)' }}>×</button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Add clip controls */}
        {active.poses.length >= 1 && (
          <div className="flex items-center gap-2 pt-2" style={{ borderTop: '1px solid var(--border)' }}>
            <select id="pm-start" className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              {active.poses.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>→</span>
            <select id="pm-end" className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              {active.poses.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button onClick={() => {
              const startEl = document.getElementById('pm-start') as HTMLSelectElement;
              const endEl = document.getElementById('pm-end') as HTMLSelectElement;
              if (startEl && endEl) addClip(startEl.value, endEl.value);
            }} className="text-xs px-3 py-1 rounded font-medium text-white" style={{ background: 'var(--accent)' }}>
              + Add Clip
            </button>
          </div>
        )}
      </div>

      {/* Generate */}
      {error && (
        <div className="p-3 rounded-lg text-sm mb-4" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {!batchId && (
        <button onClick={handleGenerate} disabled={generating || active.clips.length === 0 || active.poses.some(p => !p.imageUrl)}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50 mb-4"
          style={{ background: generating ? 'var(--text3)' : 'var(--accent)' }}>
          {generating ? 'Starting...' : `Generate ${active.clips.length} Clip${active.clips.length !== 1 ? 's' : ''}`}
        </button>
      )}

      {/* Batch progress */}
      {batchId && (
        <div className="space-y-4 mb-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
              Progress: {completedJobs.length}/{batchJobs.length} complete
              {errorJobs.length > 0 && `, ${errorJobs.length} failed`}
            </span>
            {runningJobs.length > 0 && (
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            )}
          </div>

          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${batchJobs.length > 0 ? (completedJobs.length / batchJobs.length) * 100 : 0}%`, background: errorJobs.length > 0 ? '#f59e0b' : 'var(--accent)' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {batchJobs.map((job, i) => {
              const clip = active.clips[job.slotIndex ?? i];
              const startPose = clip ? poseMap.get(clip.startPoseId) : null;
              const endPose = clip ? poseMap.get(clip.endPoseId) : null;
              const isLoop = clip?.startPoseId === clip?.endPoseId;
              return (
                <div key={job.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
                      background: isLoop ? 'var(--accent-subtle)' : 'rgba(76,175,80,0.15)',
                      color: isLoop ? 'var(--accent)' : 'var(--green)',
                    }}>
                      {startPose?.name || '?'} → {endPose?.name || '?'}
                    </span>
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text3)' }}>{clip?.prompt || ''}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0" style={{
                      background: job.status === 'complete' ? 'rgba(76,175,80,0.15)' : job.status === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(108,60,224,0.1)',
                      color: job.status === 'complete' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--accent)',
                    }}>
                      {job.status === 'complete' ? 'Done' : job.status === 'error' ? 'Failed' : 'Generating...'}
                    </span>
                  </div>

                  {job.status === 'complete' && job.result?.video?.url && (
                    <div className="relative group rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => setLightbox(job.result!.video!.url)} className="w-full cursor-zoom-in">
                        <video src={job.result.video.url} className="w-full pointer-events-none" />
                      </button>
                      <div className="absolute bottom-0 left-0 right-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center p-2 pointer-events-none">
                        <button onClick={e => { e.stopPropagation(); downloadUrl(job.result!.video!.url, `${startPose?.name || 'A'}-${endPose?.name || 'B'}-${i}.mp4`); }}
                          className="pointer-events-auto px-3 py-1 rounded text-xs text-white font-medium" style={{ background: 'var(--accent)' }}>Download</button>
                      </div>
                    </div>
                  )}

                  {job.status === 'error' && (
                    <div>
                      <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{job.error || 'Unknown error'}</p>
                      <button onClick={async () => {
                        try {
                          const res = await fetch(`/api/jobs/${job.id}/retry`, { method: 'POST' });
                          if (res.ok) setBatchJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'generating', error: undefined } : j));
                        } catch {}
                      }} className="px-3 py-1 rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Retry</button>
                    </div>
                  )}

                  {job.status !== 'complete' && job.status !== 'error' && (
                    <div className="flex items-center justify-center py-6">
                      <span className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                    </div>
                  )}

                  {job.result?.cost?.amount != null && (
                    <div className="mt-2 text-xs text-right" style={{ color: 'var(--text3)' }}>${job.result.cost.amount.toFixed(3)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {runningJobs.length === 0 && batchJobs.length > 0 && (
            <button onClick={() => { setBatchId(null); setBatchJobs([]); }}
              className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
              Run Again
            </button>
          )}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.85)' }} onClick={() => setLightbox(null)}>
          <div className="absolute top-4 right-4 flex items-center gap-6 z-10">
            <button onClick={e => { e.stopPropagation(); downloadUrl(lightbox, 'video.mp4'); }}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            </button>
            <button onClick={() => setLightbox(null)} className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <video src={lightbox} className="max-w-full max-h-[90vh] object-contain rounded-lg" controls autoPlay />
          </div>
        </div>
      )}
    </div>
  );
}
