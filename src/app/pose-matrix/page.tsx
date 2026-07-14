'use client';

import { useState, useEffect, useCallback } from 'react';
import { PoseMatrix, PoseMatrixPose, PoseMatrixClip } from '@/lib/types';
import { VIDEO_MODEL_OPTIONS } from '@/lib/models';
import AppShell from '@/components/AppShell';
import ShareDialog from '@/components/ShareDialog';
import ConfirmDialog from '@/components/ConfirmDialog';

const START_END_MODELS = VIDEO_MODEL_OPTIONS.filter(m => m.startEndFrame);

const GLOBAL_PROMPT_PRESETS: { label: string; value: string }[] = [
  {
    label: 'Male Full-body Idle',
    value: `Natural idle full-body animation of a photorealistic man. Solid black background. Static camera. Feet stay grounded throughout.
The man stands in a relaxed neutral posture with continuous subtle life:
- Natural irregular breathing visible in chest and upper torso
- Soft blinking at uneven intervals
- Slow continuous weight shifting between legs, driven from hips with natural secondary motion in torso and shoulders
- Subtle side-to-side body sway with smooth balance corrections
- Small postural micro-adjustments: slight shoulder settling, spine corrections
- Minimal hand/finger micro-movements: gentle relaxation shifts, tiny spacing adjustments
- Head remains mostly forward-facing with only minimal natural stabilizing motion
All movement should feel calm, grounded, and physically realistic with natural timing variations and micro-pauses. No robotic or frozen poses. The body stays alive with continuous organic adjustment.`,
  },
  {
    label: 'Female Full-body Idle',
    value: `Natural idle full-body animation of a photorealistic woman. Solid black background. Static camera. Feet stay grounded throughout.
The woman stands in an elegant relaxed posture with continuous subtle life:
- Soft natural breathing visible as gentle rise and fall of chest and shoulders
- Delicate blinking at natural uneven intervals
- Graceful slow weight shifting between legs, creating gentle hip movement with natural follow-through in torso
- Subtle fluid body sway, smooth and balanced
- Small feminine postural adjustments: slight head tilt, gentle shoulder roll, soft spine settling
- Delicate hand micro-movements: subtle finger relaxation, gentle wrist adjustments
- Head remains mostly forward-facing with soft minimal natural movement
All movement should feel poised, graceful, and physically realistic with natural timing variations. No stiff or artificial poses. The body stays alive with continuous elegant micro-motion.`,
  },
  {
    label: 'Male Bust Idle (Solo)',
    value: `Natural idle bust animation (head and shoulders only) of a photorealistic man. Solid black background. Static camera.
The man is framed from chest up in a relaxed posture with continuous subtle life:
- Natural irregular breathing visible in upper chest and shoulder area
- Soft blinking at uneven intervals with natural eye micro-movements
- Very subtle head micro-movements: tiny stabilizing motions, occasional minimal nod
- Small shoulder settling and postural micro-adjustments
- Slight natural facial micro-expressions: subtle jaw relaxation, gentle brow shifts
No hand, arm, or lower body motion visible. All movement contained in head, face, and upper chest area. Motion should feel calm, human, and present.`,
  },
  {
    label: 'Female Bust Idle (Solo)',
    value: `Natural idle bust animation (head and shoulders only) of a photorealistic woman. Solid black background. Static camera.
The woman is framed from chest up in an elegant posture with continuous subtle life:
- Soft natural breathing visible in upper chest and shoulders
- Delicate blinking at natural intervals with gentle eye movement
- Very subtle head micro-movements: tiny graceful adjustments, occasional soft tilt
- Gentle shoulder settling and small postural shifts
- Subtle natural facial micro-expressions: soft lip relaxation, gentle brow movement
No hand, arm, or lower body motion visible. All movement contained in head, face, and upper chest area. Motion should feel poised, feminine, and naturally alive.`,
  },
  {
    label: 'Male Full-body Talk',
    value: `Natural talking full-body animation of a photorealistic man. Solid black background. Static camera. Feet stay grounded.
The man appears to be actively engaged in conversation with natural body language:
- Expressive hand gestures: hands move to emphasize points, open palm gestures, occasional pointing or counting motions. Gestures are varied and natural, not repetitive
- Arms move freely from shoulders with natural follow-through in elbows and wrists
- Natural weight shifting between legs as he speaks
- Subtle torso movement following gesture energy
- Head makes small natural nods and tilts while speaking
- IMPORTANT: lips must NOT move. The speaking impression comes entirely from body language and gestures
- Natural breathing and blinking throughout
- Occasional pauses in gesturing with hands returning to rest position before next gesture
All motion should feel energetic but controlled, like a real person explaining something with conviction.`,
  },
  {
    label: 'Female Full-body Talk',
    value: `Natural talking full-body animation of a photorealistic woman. Solid black background. Static camera. Feet stay grounded.
The woman appears to be actively engaged in conversation with graceful body language:
- Elegant hand gestures: expressive but controlled movements to emphasize points, open gestures, gentle illustrative motions. Gestures are fluid and natural
- Arms move gracefully with smooth follow-through
- Subtle weight shifting creating gentle hip movement
- Soft torso movement following gesture energy
- Head makes natural nods and gentle tilts while speaking
- IMPORTANT: lips must NOT move. The speaking impression comes entirely from body language and gestures
- Natural breathing and delicate blinking throughout
- Graceful pauses between gestures with hands settling naturally
All motion should feel expressive yet poised, like a real person communicating with warmth and confidence.`,
  },
  {
    label: 'Male Bust Talk (Solo)',
    value: `Natural talking bust animation (head and shoulders only) of a photorealistic man. Solid black background. Static camera.
The man is framed from chest up, appearing to be actively speaking:
- Expressive head movement: natural nods, slight tilts, emphasis movements
- Animated shoulder shifts that suggest underlying gesture energy
- Dynamic facial micro-expressions: eyebrow raises, eye contact shifts, engaged expression
- IMPORTANT: lips must NOT move. The speaking impression comes from head movement, expressions, and shoulder energy
- Natural breathing and blinking throughout
- Occasional pauses with settling before next expressive movement
Motion should feel engaged and communicative, with natural rhythm and variation.`,
  },
  {
    label: 'Female Bust Talk (Solo)',
    value: `Natural talking bust animation (head and shoulders only) of a photorealistic woman. Solid black background. Static camera.
The woman is framed from chest up, appearing to be actively speaking:
- Graceful head movement: gentle nods, soft tilts, natural emphasis
- Subtle shoulder shifts suggesting expressive body language
- Animated feminine facial micro-expressions: gentle brow movement, warm eye contact shifts, engaged expression
- IMPORTANT: lips must NOT move. The speaking impression comes from head movement, expressions, and shoulder energy
- Soft breathing and delicate blinking throughout
- Graceful pauses with elegant settling between expressive movements
Motion should feel warm, communicative, and naturally feminine with smooth rhythm.`,
  },
];

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function PoseMatrixPage() {
  const [matrices, setMatrices] = useState<PoseMatrix[]>([]);
  const [active, setActive] = useState<PoseMatrix | null>(null);
  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [shareMatrix, setShareMatrix] = useState<{ id: string; name: string } | null>(null);
  const [pricing, setPricing] = useState<{ amount: number; unit: string } | null>(null);

  const loadList = useCallback(async () => {
    const res = await fetch('/api/pose-matrix');
    if (res.ok) setMatrices(await res.json());
  }, []);

  useEffect(() => { loadList(); }, [loadList]);

  useEffect(() => {
    if (!active?.modelId) { setPricing(null); return; }
    let cancelled = false;
    fetch('/api/pricing', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ modelId: active.modelId }),
    }).then(r => r.json()).then(data => {
      if (!cancelled && data.amount != null) setPricing({ amount: data.amount, unit: data.details || '' });
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [active?.modelId]);

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

  async function handleDuplicate(id: string) {
    const res = await fetch('/api/duplicate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entityType: 'pose-matrix', entityId: id }),
    });
    if (res.ok) loadList();
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
              <div className="flex items-center gap-1 flex-shrink-0">
                <button onClick={(e) => { e.stopPropagation(); setShareMatrix({ id: m.id, name: m.name }); }} className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100" style={{ color: 'var(--text3)' }} title="Share">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); handleDuplicate(m.id); }} className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100" style={{ color: 'var(--text3)' }} title="Duplicate">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                  </svg>
                </button>
                <button onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(m.id); }} className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100" style={{ color: 'var(--red)' }} title="Delete">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>

        {confirmDeleteId && (
          <ConfirmDialog
            open={true}
            onClose={() => setConfirmDeleteId(null)}
            onConfirm={() => { deleteMatrix(confirmDeleteId); setConfirmDeleteId(null); }}
            title="Delete pose matrix?"
            description="This action cannot be undone."
          />
        )}

        {shareMatrix && (
          <ShareDialog
            entityType="pose-matrix"
            entityId={shareMatrix.id}
            entityName={shareMatrix.name}
            onClose={() => setShareMatrix(null)}
          />
        )}
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
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
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
          <div>
            <label className="text-xs block mb-1" style={{ color: 'var(--text3)' }}>FPS</label>
            <select value={active.fps} onChange={e => { const fps = parseInt(e.target.value); setActive({ ...active, fps }); save({ fps }); }}
              className="w-full px-2 py-1.5 rounded text-sm" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)' }}>
              <option value={24}>24</option>
              <option value={30}>30</option>
              <option value={60}>60</option>
            </select>
          </div>
        </div>
        {pricing && active.clips.length > 0 && (() => {
          const isPerSec = pricing.unit.toLowerCase().includes('second');
          const perClip = isPerSec ? pricing.amount * active.duration : pricing.amount;
          const total = perClip * active.clips.length;
          return (
            <div className="flex items-center gap-4 mt-3 pt-3 text-xs" style={{ borderTop: '1px solid var(--border)' }}>
              <span style={{ color: 'var(--text3)' }}>Per clip: <span className="font-medium" style={{ color: 'var(--text2)' }}>~${perClip.toFixed(2)}</span></span>
              <span style={{ color: 'var(--text3)' }}>Total ({active.clips.length} clips): <span className="font-semibold" style={{ color: 'var(--green)' }}>~${total.toFixed(2)}</span></span>
            </div>
          );
        })()}
      </div>

      {/* Global Instruction */}
      <div className="p-4 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <div className="flex items-center justify-between mb-2">
          <p className="text-sm font-medium">Global Instruction</p>
          <select
            value=""
            onChange={e => {
              const preset = GLOBAL_PROMPT_PRESETS.find(p => p.label === e.target.value);
              if (preset) { setActive({ ...active, globalPrompt: preset.value }); save({ globalPrompt: preset.value }); }
            }}
            className="text-xs px-2 py-1 rounded"
            style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--accent)' }}
          >
            <option value="">Load preset...</option>
            {GLOBAL_PROMPT_PRESETS.map(p => <option key={p.label} value={p.label}>{p.label}</option>)}
          </select>
        </div>
        <textarea
          value={active.globalPrompt || ''}
          onChange={e => { setActive({ ...active, globalPrompt: e.target.value }); save({ globalPrompt: e.target.value }); }}
          placeholder="Shared instruction for all clips. Select a preset above or write your own."
          className="w-full text-sm px-3 py-2 rounded-lg resize-none"
          style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text1)', minHeight: '72px' }}
          rows={5}
        />
        <p className="text-xs mt-1.5" style={{ color: 'var(--text3)' }}>
          Applied to every clip. Per-clip instructions (below) add to or override this.
        </p>
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
