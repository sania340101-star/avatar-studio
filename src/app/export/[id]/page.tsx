'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { ExportSession, ExportClip, Generation } from '@/lib/types';
import { DEVICE_PRESETS } from '@/lib/models';
import MaskPreview from '@/components/MaskPreview';

function ExportEditorContent() {
  const params = useParams();
  const router = useRouter();
  const { projects } = useProject();
  const sessionId = params.id as string;

  const [session, setSession] = useState<ExportSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [nameEditing, setNameEditing] = useState(false);
  const [nameValue, setNameValue] = useState('');

  const [showBrowser, setShowBrowser] = useState(false);
  const [browserVideos, setBrowserVideos] = useState<Generation[]>([]);
  const [browserFilter, setBrowserFilter] = useState('all');
  const [browserLoading, setBrowserLoading] = useState(false);

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Sequential player state
  const [activeClipIdx, setActiveClipIdx] = useState<number>(0);
  const [lockedClipIdx, setLockedClipIdx] = useState<number | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const load = useCallback(async () => {
    const res = await fetch(`/api/exports?id=${sessionId}`);
    if (res.ok) {
      const data = await res.json();
      if (!data.transform) data.transform = { offsetX: 0, offsetY: 0, scale: 1 };
      setSession(data);
      setNameValue(data.name);
    }
    setLoading(false);
  }, [sessionId]);

  useEffect(() => { load(); }, [load]);

  const save = useCallback(async (updates: Partial<ExportSession>) => {
    if (!session) return;
    setSaving(true);
    const res = await fetch('/api/exports', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id, ...updates }),
    });
    if (res.ok) {
      const updated = await res.json();
      if (!updated.transform) updated.transform = { offsetX: 0, offsetY: 0, scale: 1 };
      setSession(updated);
    }
    setSaving(false);
  }, [session]);

  const debouncedSave = useCallback((updates: Partial<ExportSession>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(updates), 800);
  }, [save]);

  async function loadBrowserVideos() {
    setBrowserLoading(true);
    const params = new URLSearchParams({ type: 'video' });
    if (browserFilter !== 'all') params.set('projectId', browserFilter);
    const res = await fetch(`/api/generations?${params}`);
    if (res.ok) {
      const data: Generation[] = await res.json();
      setBrowserVideos(data.filter(g => g.status === 'completed' && g.resultUrls.length > 0));
    }
    setBrowserLoading(false);
  }

  useEffect(() => {
    if (showBrowser) loadBrowserVideos();
  }, [showBrowser, browserFilter]);

  function clipLabel(gen: Generation): string {
    const slotIdx = gen.params.slotIndex as number | undefined;
    const templateName = gen.params.templateName as string | undefined;
    if (templateName && slotIdx != null) return `${templateName} — Slot ${slotIdx + 1}`;
    if (slotIdx != null) return `Slot ${slotIdx + 1} · ${gen.modelLabel}`;
    return gen.prompt.slice(0, 60) || gen.modelLabel || 'Untitled';
  }

  function addClip(gen: Generation) {
    if (!session) return;
    const clip: ExportClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      generationId: gen.id,
      projectId: gen.projectId,
      url: gen.resultUrls[0],
      label: clipLabel(gen),
      transform: { offsetX: 0, offsetY: 0, scale: 1 },
    };
    const updated = { clips: [...session.clips, clip] };
    setSession({ ...session, ...updated, updatedAt: Date.now() });
    debouncedSave(updated);
  }

  function removeClip(idx: number) {
    if (!session) return;
    const clips = session.clips.filter((_, i) => i !== idx);
    setSession({ ...session, clips, updatedAt: Date.now() });
    debouncedSave({ clips });
    if (activeClipIdx >= clips.length) setActiveClipIdx(Math.max(0, clips.length - 1));
    if (lockedClipIdx !== null && lockedClipIdx >= clips.length) setLockedClipIdx(null);
  }

  function duplicateClip(idx: number) {
    if (!session) return;
    const original = session.clips[idx];
    const dup: ExportClip = {
      ...original,
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    };
    const clips = [...session.clips];
    clips.splice(idx + 1, 0, dup);
    setSession({ ...session, clips, updatedAt: Date.now() });
    debouncedSave({ clips });
  }

  function moveClip(from: number, to: number) {
    if (!session || from === to) return;
    const clips = [...session.clips];
    const [moved] = clips.splice(from, 1);
    clips.splice(to, 0, moved);
    setSession({ ...session, clips, updatedAt: Date.now() });
    debouncedSave({ clips });
  }

  function updateTransform(transform: { offsetX: number; offsetY: number; scale: number }) {
    if (!session) return;
    setSession({ ...session, transform, updatedAt: Date.now() });
    debouncedSave({ transform });
  }

  function setDevice(device: 'hh1x3' | 'solo') {
    if (!session) return;
    setSession({ ...session, device, updatedAt: Date.now() });
    debouncedSave({ device });
  }

  function handleNameSave() {
    if (!session || !nameValue.trim()) return;
    setNameEditing(false);
    setSession({ ...session, name: nameValue.trim(), updatedAt: Date.now() });
    save({ name: nameValue.trim() });
  }

  function handleDragStart(idx: number) {
    setDragIdx(idx);
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    setDragOverIdx(idx);
  }
  function handleDrop(idx: number) {
    if (dragIdx !== null && dragIdx !== idx) {
      moveClip(dragIdx, idx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  }
  function handleDragEnd() {
    setDragIdx(null);
    setDragOverIdx(null);
  }

  // Sequential player: advance to next clip when video ends
  const handleVideoEnded = useCallback(() => {
    if (!session || session.clips.length === 0) return;
    if (lockedClipIdx !== null) return; // locked — just loop (video has loop attr when locked)
    const next = (activeClipIdx + 1) % session.clips.length;
    setActiveClipIdx(next);
  }, [session, activeClipIdx, lockedClipIdx]);

  function toggleLockClip(idx: number) {
    if (lockedClipIdx === idx) {
      setLockedClipIdx(null);
    } else {
      setLockedClipIdx(idx);
      setActiveClipIdx(idx);
    }
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.title]));

  const currentClipUrl = session?.clips[activeClipIdx]?.url;
  const isLocked = lockedClipIdx !== null;

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="font-medium mb-2" style={{ color: 'var(--text1)' }}>Export session not found</p>
        <button onClick={() => router.push('/export')} className="text-sm" style={{ color: 'var(--accent)' }}>Back to exports</button>
      </div>
    );
  }

  const preset = DEVICE_PRESETS[session.device];

  return (
    <div>
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => router.push('/export')}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <path d="M19 12H5M12 19l-7-7 7-7" />
          </svg>
        </button>
        <div className="flex-1 min-w-0">
          {nameEditing ? (
            <input
              autoFocus
              value={nameValue}
              onChange={e => setNameValue(e.target.value)}
              onBlur={handleNameSave}
              onKeyDown={e => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') { setNameEditing(false); setNameValue(session.name); } }}
              className="text-xl font-semibold w-full !py-1 !px-2"
            />
          ) : (
            <h2
              className="text-xl font-semibold cursor-pointer hover:opacity-70 truncate flex items-center gap-2"
              onClick={() => setNameEditing(true)}
              title="Click to rename"
            >
              {session.name}
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0 opacity-40">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
              </svg>
            </h2>
          )}
          <div className="flex items-center gap-3 mt-0.5">
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
            </span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              {preset.name} ({preset.width}x{preset.height})
            </span>
            {saving && <span className="text-xs" style={{ color: 'var(--accent)' }}>Saving...</span>}
          </div>
        </div>
      </div>

      {/* Device selector */}
      <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--text3)' }}>DEVICE</p>
        <div className="flex gap-2">
          {(Object.entries(DEVICE_PRESETS) as [string, { name: string; width: number; height: number; fps: number }][]).map(([key, dev]) => (
            <button
              key={key}
              onClick={() => setDevice(key as 'hh1x3' | 'solo')}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: session.device === key ? 'var(--accent)' : 'var(--bg-input)',
                color: session.device === key ? 'white' : 'var(--text2)',
              }}
            >
              {dev.name}
              <span className="text-xs opacity-70 ml-1">({dev.width}x{dev.height})</span>
            </button>
          ))}
        </div>
      </div>

      {/* Playlist */}
      <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold" style={{ color: 'var(--text3)' }}>PLAYLIST</p>
          <button
            onClick={() => setShowBrowser(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
            style={{ background: 'var(--accent)' }}
          >
            + Add Videos
          </button>
        </div>

        {session.clips.length === 0 ? (
          <div
            className="rounded-lg border-2 border-dashed p-8 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
            style={{ borderColor: 'var(--border)' }}
            onClick={() => setShowBrowser(true)}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text3)' }}>
              <circle cx="12" cy="12" r="10" /><path d="M12 8v8M8 12h8" />
            </svg>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              Add videos from your projects to build a playlist
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {session.clips.map((clip, idx) => (
              <div
                key={clip.id}
                draggable
                onDragStart={() => handleDragStart(idx)}
                onDragOver={(e) => handleDragOver(e, idx)}
                onDrop={() => handleDrop(idx)}
                onDragEnd={handleDragEnd}
                className={`flex items-center gap-3 p-2 rounded-lg border transition-all ${
                  dragOverIdx === idx ? 'border-[var(--accent)]' : ''
                } ${dragIdx === idx ? 'opacity-40' : ''}`}
                style={{
                  borderColor: dragOverIdx === idx ? 'var(--accent)' : idx === activeClipIdx ? 'var(--accent)' : 'var(--border)',
                  background: idx === activeClipIdx ? 'var(--bg-input)' : 'var(--bg)',
                }}
              >
                {/* Drag handle */}
                <div className="cursor-grab active:cursor-grabbing flex-shrink-0 px-1" style={{ color: 'var(--text3)' }}>
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                    <circle cx="9" cy="6" r="1.5" /><circle cx="15" cy="6" r="1.5" />
                    <circle cx="9" cy="12" r="1.5" /><circle cx="15" cy="12" r="1.5" />
                    <circle cx="9" cy="18" r="1.5" /><circle cx="15" cy="18" r="1.5" />
                  </svg>
                </div>

                {/* Order number */}
                <span className="text-xs font-medium w-5 text-center flex-shrink-0" style={{ color: 'var(--accent)' }}>
                  {idx + 1}
                </span>

                {/* Thumbnail — click to preview */}
                <button
                  onClick={() => setPreviewUrl(clip.url)}
                  className="w-16 h-10 rounded overflow-hidden flex-shrink-0 relative group cursor-pointer"
                  style={{ background: 'var(--bg-input)' }}
                  title="Preview"
                >
                  <video src={clip.url} className="w-full h-full object-cover" muted />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  </div>
                </button>

                {/* Label + project */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate" style={{ color: 'var(--text1)' }}>{clip.label}</p>
                  {projectMap[clip.projectId] && (
                    <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{projectMap[clip.projectId]}</p>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button
                    onClick={() => moveClip(idx, idx - 1)}
                    disabled={idx === 0}
                    className="w-7 h-7 rounded flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors disabled:opacity-20"
                    style={{ color: 'var(--text3)' }}
                    title="Move up"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => moveClip(idx, idx + 1)}
                    disabled={idx === session.clips.length - 1}
                    className="w-7 h-7 rounded flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors disabled:opacity-20"
                    style={{ color: 'var(--text3)' }}
                    title="Move down"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={() => duplicateClip(idx)}
                    className="w-7 h-7 rounded flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors"
                    style={{ color: 'var(--text3)' }}
                    title="Duplicate"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                    </svg>
                  </button>
                  <button
                    onClick={() => removeClip(idx)}
                    className="w-7 h-7 rounded flex items-center justify-center hover:bg-[var(--bg-input)] transition-colors"
                    style={{ color: 'var(--red, #ef4444)' }}
                    title="Remove"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M18 6L6 18M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mask Preview with Sequential Player */}
      {session.clips.length > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--text3)' }}>MASK PREVIEW</p>
            <div className="flex items-center gap-2">
              {isLocked && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                  🔒 Clip {lockedClipIdx! + 1} looped
                </span>
              )}
            </div>
          </div>

          {/* Clip segment bar */}
          {session.clips.length > 1 && (
            <div className="flex gap-1 mb-3">
              {session.clips.map((clip, idx) => (
                <button
                  key={clip.id}
                  onClick={() => toggleLockClip(idx)}
                  className="flex-1 py-1.5 rounded text-[10px] font-medium transition-all truncate px-1"
                  style={{
                    background: idx === activeClipIdx
                      ? lockedClipIdx === idx ? 'var(--accent)' : 'rgba(var(--accent-rgb, 99,102,241), 0.3)'
                      : 'var(--bg-input)',
                    color: idx === activeClipIdx ? 'white' : 'var(--text3)',
                    border: lockedClipIdx === idx ? '2px solid var(--accent)' : '1px solid var(--border)',
                  }}
                  title={lockedClipIdx === idx ? 'Click to unlock' : 'Click to loop this clip'}
                >
                  {idx + 1}
                </button>
              ))}
            </div>
          )}

          <p className="text-xs mb-2 truncate" style={{ color: 'var(--text2)' }}>
            Clip {activeClipIdx + 1}: {session.clips[activeClipIdx]?.label}
          </p>

          <MaskPreview
            device={session.device}
            videoUrl={currentClipUrl || ''}
            transform={session.transform}
            onTransformChange={updateTransform}
            loop={isLocked}
            onVideoEnded={handleVideoEnded}
            key={activeClipIdx}
          />
        </div>
      )}

      {/* Video Browser Modal */}
      {showBrowser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowBrowser(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>Add Videos</h3>
              <button onClick={() => setShowBrowser(false)} style={{ color: 'var(--text3)' }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                  <path d="M18 6L6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="px-4 pt-3 pb-2">
              <select
                value={browserFilter}
                onChange={e => setBrowserFilter(e.target.value)}
                className="text-sm px-3 py-2 rounded-lg border w-full"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
              >
                <option value="all">All Projects</option>
                {projects.map(p => (
                  <option key={p.id} value={p.id}>{p.title}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-auto p-4 pt-2">
              {browserLoading ? (
                <div className="flex items-center justify-center py-10">
                  <div className="w-5 h-5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                </div>
              ) : browserVideos.length === 0 ? (
                <p className="text-sm text-center py-10" style={{ color: 'var(--text3)' }}>No videos found</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {browserVideos.map(gen => {
                    const alreadyAdded = session.clips.some(c => c.generationId === gen.id);
                    return (
                      <div
                        key={gen.id}
                        className={`rounded-lg border overflow-hidden transition-colors ${alreadyAdded ? 'opacity-50' : 'cursor-pointer hover:border-[var(--accent)]'}`}
                        style={{ borderColor: 'var(--border)' }}
                        onClick={() => { if (!alreadyAdded) addClip(gen); }}
                      >
                        <div className="aspect-video relative" style={{ background: 'var(--bg-input)' }}>
                          <video src={gen.resultUrls[0]} className="w-full h-full object-cover" muted />
                          {alreadyAdded && (
                            <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-6 h-6">
                                <polyline points="20 6 9 17 4 12" />
                              </svg>
                            </div>
                          )}
                        </div>
                        <div className="p-2">
                          <p className="text-xs truncate" style={{ color: 'var(--text2)' }}>{gen.prompt.slice(0, 50) || 'Untitled'}</p>
                          {projectMap[gen.projectId] && (
                            <p className="text-[10px] truncate" style={{ color: 'var(--text3)' }}>{projectMap[gen.projectId]}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="p-4 border-t flex justify-end gap-2" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setShowBrowser(false)}
                className="px-5 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => setShowBrowser(false)}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--accent)' }}
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Video preview lightbox */}
      {previewUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={() => setPreviewUrl(null)}
        >
          <button
            onClick={() => setPreviewUrl(null)}
            className="absolute top-4 right-4 w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors z-10"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <video src={previewUrl} className="max-w-full max-h-[90vh] object-contain rounded-lg" controls autoPlay />
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExportEditorPage() {
  return <AppShell><ExportEditorContent /></AppShell>;
}
