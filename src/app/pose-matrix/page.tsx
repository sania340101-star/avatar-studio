'use client';

import { useState, useEffect, useCallback } from 'react';
import { PoseMatrix, PoseMatrixPose, PoseMatrixClip } from '@/lib/types';
import { VIDEO_MODEL_OPTIONS } from '@/lib/models';
import AppShell from '@/components/AppShell';

const START_END_MODELS = VIDEO_MODEL_OPTIONS.filter(m => m.startEndFrame);

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PoseMatrixPage() {
  const [matrices, setMatrices] = useState<PoseMatrix[]>([]);
  const [active, setActive] = useState<PoseMatrix | null>(null);
  const [saving, setSaving] = useState(false);

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
    const poses = [...active.poses, { id: uid(), name: `Pose ${active.poses.length + 1}` }];
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

  const poseMap = new Map(active?.poses.map(p => [p.id, p]) || []);
  const loops = active?.clips.filter(c => c.startPoseId === c.endPoseId) || [];
  const transitions = active?.clips.filter(c => c.startPoseId !== c.endPoseId) || [];

  if (!active) {
    return (
      <AppShell>
      <div className="max-w-3xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">Pose Matrix</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>Create reusable pose templates for start-end frame video generation.</p>
          </div>
          <button onClick={createMatrix} className="px-4 py-2 rounded-lg text-sm font-semibold text-white" style={{ background: 'var(--accent)' }}>
            + New Template
          </button>
        </div>
        {matrices.length === 0 && (
          <div className="text-center py-16" style={{ color: 'var(--text3)' }}>
            <p className="text-lg mb-2">No pose templates yet</p>
            <p className="text-sm">Create a template with poses and clips, then use it in Generate Video.</p>
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
      </AppShell>
    );
  }

  return (
    <AppShell>
    <div className="max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <button onClick={() => setActive(null)} className="text-sm" style={{ color: 'var(--text3)' }}>← Back</button>
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
          <p className="text-xs py-4 text-center" style={{ color: 'var(--text3)' }}>Add pose slots. Images will be assigned when generating in a project.</p>
        )}
        <div className="flex flex-wrap gap-2">
          {active.poses.map((pose, i) => (
            <div key={pose.id} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'var(--bg)', border: '1px solid var(--border)' }}>
              <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--accent)' }}>{i + 1}</span>
              <input value={pose.name} onChange={e => updatePose(pose.id, { name: e.target.value })}
                className="text-sm bg-transparent border-none outline-none w-28" style={{ color: 'var(--text1)' }} />
              <button onClick={() => removePose(pose.id)} className="text-xs" style={{ color: 'var(--red)' }}>×</button>
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
                    <input value={clip.prompt} onChange={e => updateClip(clip.id, { prompt: e.target.value })} placeholder="Instruction for the agent..."
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
                    <input value={clip.prompt} onChange={e => updateClip(clip.id, { prompt: e.target.value })} placeholder="Instruction for the agent..."
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

      <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>
        To generate videos, go to Generate Video in a project and select this template in Pose Matrix mode.
      </p>
    </div>
    </AppShell>
  );
}
