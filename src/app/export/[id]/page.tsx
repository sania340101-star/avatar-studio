'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { ExportSession, ExportClip, Generation } from '@/lib/types';
import { DEVICE_PRESETS } from '@/lib/models';
import MaskPreview from '@/components/MaskPreview';
import { analyzeAutofit, AutofitProgress } from '@/lib/autofit';

function probeDuration(url: string): Promise<number> {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { resolve(v.duration); v.remove(); };
    v.onerror = () => { resolve(0); v.remove(); };
    v.src = url;
  });
}

function formatDuration(s: number): string {
  if (!s || !isFinite(s)) return '—';
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return m > 0 ? `${m}:${sec.toString().padStart(2, '0')}` : `${sec}s`;
}

function fileHash(url: string): string {
  const match = url.match(/\/([^/]+)\.[^.]+$/);
  if (!match) return '';
  const name = match[1];
  return name.length > 8 ? name.slice(-6) : name;
}

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
  const [browserSelected, setBrowserSelected] = useState<Set<string>>(new Set());

  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [autofitting, setAutofitting] = useState(false);
  const [autofitProgress, setAutofitProgress] = useState<AutofitProgress | null>(null);
  const [versionHistoryOpen, setVersionHistoryOpen] = useState(true);
  const [confirmDeleteVersion, setConfirmDeleteVersion] = useState<{ id: string; num: number } | null>(null);
  const [confirmDeleteSession, setConfirmDeleteSession] = useState(false);
  const [safetyPaddingPx, setSafetyPaddingPx] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Transform undo stack
  const transformHistory = useRef<Array<{ offsetX: number; offsetY: number; scale: number }>>([]);
  const isGesturing = useRef(false);
  const gestureTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const [historyLen, setHistoryLen] = useState(0);

  // Sequential player state
  const [activeClipIdx, setActiveClipIdx] = useState<number>(0);
  const [lockedClipIdx, setLockedClipIdx] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);
  const saveTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pollTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

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

  useEffect(() => {
    if (!session) return;
    const missing = session.clips.filter(c => !c.duration);
    if (missing.length === 0) return;
    Promise.all(missing.map(async (c) => {
      const dur = await probeDuration(c.url);
      return { id: c.id, duration: dur > 0 ? Math.round(dur * 10) / 10 : undefined };
    })).then(results => {
      const durMap = new Map(results.filter(r => r.duration).map(r => [r.id, r.duration]));
      if (durMap.size === 0) return;
      const clips = session.clips.map(c => durMap.has(c.id) ? { ...c, duration: durMap.get(c.id) } : c);
      setSession(prev => prev ? { ...prev, clips } : prev);
      debouncedSave({ clips });
    });
  }, [session?.id, session?.clips.length]);

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
    if (showBrowser) {
      loadBrowserVideos();
      setBrowserSelected(new Set());
    }
  }, [showBrowser, browserFilter]);

  function clipLabel(gen: Generation): string {
    const slotIdx = gen.params.slotIndex as number | undefined;
    const templateName = gen.params.templateName as string | undefined;
    if (templateName && slotIdx != null) return `${templateName} — Slot ${slotIdx + 1}`;
    if (slotIdx != null) return `Slot ${slotIdx + 1} · ${gen.modelLabel}`;
    return gen.prompt.slice(0, 60) || gen.modelLabel || 'Untitled';
  }

  async function addClip(gen: Generation) {
    if (!session) return;
    const dur = await probeDuration(gen.resultUrls[0]);
    const clip: ExportClip = {
      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      generationId: gen.id,
      projectId: gen.projectId,
      url: gen.resultUrls[0],
      label: clipLabel(gen),
      duration: dur > 0 ? Math.round(dur * 10) / 10 : undefined,
      source: 'generation',
      transform: { offsetX: 0, offsetY: 0, scale: 1 },
    };
    const updated = { clips: [...session.clips, clip] };
    setSession({ ...session, ...updated, updatedAt: Date.now() });
    debouncedSave(updated);
  }

  async function addUploadedClip(file: File) {
    if (!session) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-user-id': session.userId },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json();
        alert(err.error || 'Upload failed');
        return;
      }
      const { url } = await res.json();
      const dur = await probeDuration(url);
      const clip: ExportClip = {
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url,
        label: file.name.replace(/\.[^.]+$/, ''),
        duration: dur > 0 ? Math.round(dur * 10) / 10 : undefined,
        source: 'upload',
        transform: { offsetX: 0, offsetY: 0, scale: 1 },
      };
      const updated = { clips: [...session.clips, clip] };
      setSession({ ...session, ...updated, updatedAt: Date.now() });
      debouncedSave(updated);
    } finally {
      setUploading(false);
    }
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

  function pushTransformHistory() {
    if (!session) return;
    const cur = session.transform;
    const last = transformHistory.current[transformHistory.current.length - 1];
    if (!last || last.offsetX !== cur.offsetX || last.offsetY !== cur.offsetY || last.scale !== cur.scale) {
      transformHistory.current.push({ ...cur });
      if (transformHistory.current.length > 20) transformHistory.current.shift();
      setHistoryLen(transformHistory.current.length);
    }
  }

  function updateTransform(transform: { offsetX: number; offsetY: number; scale: number }, fromUndo = false) {
    if (!session) return;
    if (!fromUndo) {
      if (!isGesturing.current) {
        isGesturing.current = true;
        pushTransformHistory();
      }
      clearTimeout(gestureTimer.current);
      gestureTimer.current = setTimeout(() => { isGesturing.current = false; }, 1000);
    }
    setSession({ ...session, transform, updatedAt: Date.now() });
    debouncedSave({ transform });
  }

  function undoTransform() {
    if (transformHistory.current.length === 0 || !session) return;
    const prev = transformHistory.current.pop()!;
    setHistoryLen(transformHistory.current.length);
    isGesturing.current = false;
    clearTimeout(gestureTimer.current);
    updateTransform(prev, true);
  }

  async function runAutofit() {
    if (!session || session.clips.length === 0 || autofitting) return;
    pushTransformHistory();
    isGesturing.current = false;
    setAutofitting(true);
    setAutofitProgress(null);
    try {
      const result = await analyzeAutofit(
        session.clips.map(c => c.url),
        session.device,
        (p) => setAutofitProgress(p),
        0.5,
        safetyPaddingPx,
      );
      if (result) {
        updateTransform(result, true);
      } else {
        transformHistory.current.pop();
        setHistoryLen(transformHistory.current.length);
        alert('No poses detected in any clip. Try adjusting manually.');
      }
    } catch (err) {
      transformHistory.current.pop();
      setHistoryLen(transformHistory.current.length);
      alert('Auto-fit failed: ' + (err instanceof Error ? err.message : 'unknown error'));
    } finally {
      setAutofitting(false);
      setAutofitProgress(null);
    }
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

  // Touch drag-and-drop for mobile
  const touchState = useRef<{ idx: number; startY: number; originY: number; el: HTMLElement | null }>({ idx: -1, startY: 0, originY: 0, el: null });
  const clipListRef = useRef<HTMLDivElement>(null);

  function handleTouchStart(e: React.TouchEvent, idx: number) {
    const handle = (e.target as HTMLElement).closest('[data-drag-handle]');
    if (!handle) return;
    const touch = e.touches[0];
    const el = e.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    touchState.current = { idx, startY: touch.clientY, originY: rect.top, el };
    el.style.transition = 'none';
    el.style.zIndex = '50';
    el.style.boxShadow = '0 8px 25px rgba(0,0,0,0.25)';
    el.style.transform = 'scale(1.03)';
    setDragIdx(idx);
  }

  function handleTouchMove(e: React.TouchEvent) {
    if (touchState.current.idx < 0 || !clipListRef.current) return;
    e.preventDefault();
    const touch = e.touches[0];
    const deltaY = touch.clientY - touchState.current.startY;
    const el = touchState.current.el;
    if (el) {
      el.style.transform = `translateY(${deltaY}px) scale(1.03)`;
    }
    const items = clipListRef.current.querySelectorAll<HTMLElement>('[data-clip-item]');
    let newOver: number | null = null;
    for (let i = 0; i < items.length; i++) {
      const rect = items[i].getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      if (i !== touchState.current.idx && touch.clientY >= rect.top && touch.clientY <= rect.bottom) {
        newOver = touch.clientY < midY ? i : i;
        break;
      }
    }
    if (newOver !== null) setDragOverIdx(newOver);
  }

  function handleTouchEnd() {
    const el = touchState.current.el;
    if (el) {
      el.style.transition = 'transform 0.2s ease, box-shadow 0.2s ease';
      el.style.transform = '';
      el.style.boxShadow = '';
      el.style.zIndex = '';
      setTimeout(() => { el.style.transition = ''; }, 200);
    }
    if (touchState.current.idx >= 0 && dragOverIdx !== null && dragOverIdx !== touchState.current.idx) {
      moveClip(touchState.current.idx, dragOverIdx);
    }
    touchState.current = { idx: -1, startY: 0, originY: 0, el: null };
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

  async function startExport() {
    if (!session || session.clips.length === 0) return;
    setExporting(true);
    const res = await fetch('/api/exports/render', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: session.id }),
    });
    if (!res.ok) {
      const err = await res.json();
      setExporting(false);
      alert(err.error || 'Export failed');
      return;
    }
    setSession({ ...session, status: 'exporting', updatedAt: Date.now() });
    pollExportStatus();
  }

  function pollExportStatus() {
    pollTimer.current = setTimeout(async () => {
      const res = await fetch(`/api/exports?id=${sessionId}`);
      if (res.ok) {
        const data = await res.json();
        if (!data.transform) data.transform = { offsetX: 0, offsetY: 0, scale: 1 };
        setSession(data);
        if (data.status === 'exporting') {
          pollExportStatus();
        } else {
          setExporting(false);
        }
      } else {
        setExporting(false);
      }
    }, 2000);
  }

  useEffect(() => {
    return () => { if (pollTimer.current) clearTimeout(pollTimer.current); };
  }, []);

  async function downloadExport() {
    if (!session?.exportUrl) return;
    const res = await fetch(session.exportUrl);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${session.name.replace(/[^a-zA-Z0-9-_ ]/g, '')}.mp4`;
    a.click();
    URL.revokeObjectURL(a.href);
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
  const totalDuration = session.clips.reduce((sum, c) => sum + (c.duration || 0), 0);

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
              {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
            </span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              {preset.name} ({preset.width}x{preset.height})
            </span>
            {saving && <span className="text-xs" style={{ color: 'var(--accent)' }}>Saving...</span>}
          </div>
        </div>
        <button
          onClick={() => setConfirmDeleteSession(true)}
          className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0 opacity-50 hover:opacity-100"
          style={{ color: 'var(--red)' }}
          title="Delete export"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
            <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>
        </button>
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
          <p className="text-xs font-semibold" style={{ color: 'var(--text3)' }}>
            PLAYLIST
            {session.clips.length > 0 && (
              <span className="font-normal ml-2" style={{ color: 'var(--text3)' }}>
                {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
                {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
              </span>
            )}
          </p>
          <div className="flex gap-2">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime,.mp4,.webm,.mov"
              multiple
              className="hidden"
              onChange={async (e) => {
                const files = e.target.files;
                if (!files) return;
                for (const f of Array.from(files)) await addUploadedClip(f);
                e.target.value = '';
              }}
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="text-xs px-3 py-1.5 rounded-lg font-medium"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              {uploading ? 'Uploading...' : '↑ Upload'}
            </button>
            <button
              onClick={() => setShowBrowser(true)}
              className="text-xs px-3 py-1.5 rounded-lg font-medium text-white"
              style={{ background: 'var(--accent)' }}
            >
              + Add Videos
            </button>
          </div>
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
              Add videos from your projects or upload from your device
            </p>
          </div>
        ) : (
          <div className="space-y-2" ref={clipListRef}>
            {session.clips.map((clip, idx) => (
              <div key={clip.id} className="relative">
                {/* Drop indicator line */}
                {dragOverIdx === idx && dragIdx !== null && dragIdx !== idx && (
                  <div className="absolute -top-1.5 left-0 right-0 flex items-center z-10">
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                    <div className="flex-1 h-0.5" style={{ background: 'var(--accent)' }} />
                    <div className="w-3 h-3 rounded-full flex-shrink-0" style={{ background: 'var(--accent)' }} />
                  </div>
                )}
                <div
                  data-clip-item
                  draggable
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDrop={() => handleDrop(idx)}
                  onDragEnd={handleDragEnd}
                  onTouchStart={(e) => handleTouchStart(e, idx)}
                  onTouchMove={(e) => handleTouchMove(e)}
                  onTouchEnd={handleTouchEnd}
                  className="flex items-center gap-3 p-2 rounded-lg border transition-all"
                  style={{
                    borderColor: idx === activeClipIdx ? 'var(--accent)' : 'var(--border)',
                    background: idx === activeClipIdx ? 'var(--bg-input)' : 'var(--bg)',
                  }}
                >
                {/* Drag handle */}
                <div data-drag-handle className="cursor-grab active:cursor-grabbing flex-shrink-0 px-1 touch-none" style={{ color: 'var(--text3)' }}>
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

                {/* Label + tags + duration */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm line-clamp-2 leading-tight" style={{ color: 'var(--text1)' }}>{clip.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                    {clip.duration != null && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                        {formatDuration(clip.duration)}
                      </span>
                    )}
                    <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 font-mono" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                      #{fileHash(clip.url)}
                    </span>
                    {session.clips.filter(c => c.url === clip.url).length > 1 && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'rgba(var(--accent-rgb, 99,102,241), 0.15)', color: 'var(--accent)' }}>
                        ×{session.clips.filter(c => c.url === clip.url).length}
                      </span>
                    )}
                    {clip.source === 'upload' && (
                      <span className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                        ↑ upload
                      </span>
                    )}
                    {clip.projectId && projectMap[clip.projectId] && (
                      <span className="text-[10px] truncate max-w-[80px]" style={{ color: 'var(--text3)' }}>
                        {projectMap[clip.projectId]}
                      </span>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1 flex-shrink-0">
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
            loop={isLocked || session.clips.length === 1}
            onVideoEnded={handleVideoEnded}
            playKey={activeClipIdx}
          />

          {/* Auto-fit + Undo */}
          <div className="mt-2 space-y-2">
            <div className="flex items-center gap-2">
              <button
                onClick={runAutofit}
                disabled={autofitting || session.clips.length === 0}
                className="text-xs px-3 py-1.5 rounded-lg font-medium disabled:opacity-50 flex items-center gap-1.5"
                style={{ background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
              >
                {autofitting ? (
                  <>
                    <div className="w-3 h-3 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'var(--accent)', borderTopColor: 'transparent' }} />
                    Analyzing...
                  </>
                ) : (
                  <>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                      <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7" />
                    </svg>
                    Auto-fit
                  </>
                )}
              </button>
              {historyLen > 0 && !autofitting && (
                <button
                  onClick={undoTransform}
                  className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5"
                  style={{ background: 'var(--bg-input)', color: 'var(--text2)', border: '1px solid var(--border)' }}
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M3 10h10a5 5 0 0 1 0 10H9" /><polyline points="7 14 3 10 7 6" />
                  </svg>
                  Undo
                  {historyLen > 1 && <span className="opacity-60">({historyLen})</span>}
                </button>
              )}
            </div>
            <div className="flex items-center gap-3">
              <label className="text-[10px] font-medium flex-shrink-0" style={{ color: 'var(--text3)' }}>
                Safety Padding
              </label>
              <input
                type="range"
                min={0}
                max={100}
                value={safetyPaddingPx}
                onChange={e => setSafetyPaddingPx(Number(e.target.value))}
                className="flex-1 h-1 rounded-full appearance-none cursor-pointer"
                style={{ accentColor: 'var(--accent)' }}
              />
              <span className="text-[10px] w-8 text-right flex-shrink-0 font-mono" style={{ color: 'var(--text3)' }}>
                {safetyPaddingPx}px
              </span>
            </div>
            {autofitProgress && (
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--bg-input)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-300"
                      style={{ width: `${autofitProgress.percent}%`, background: 'var(--accent)' }}
                    />
                  </div>
                  <span className="text-[10px] w-8 text-right flex-shrink-0" style={{ color: 'var(--text3)' }}>
                    {autofitProgress.percent}%
                  </span>
                </div>
                <p className="text-[10px] truncate" style={{ color: 'var(--text3)' }}>
                  {autofitProgress.message}
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Export Action */}
      {session.clips.length > 0 && (
        <div className="rounded-xl border p-4 mb-4" style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-semibold mb-1" style={{ color: 'var(--text3)' }}>RENDER</p>
              <p className="text-xs" style={{ color: 'var(--text3)' }}>
                {preset.width}x{preset.height} @ 60fps &middot; {session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}
                {totalDuration > 0 && ` · ${formatDuration(totalDuration)}`}
              </p>
              <label className="flex items-center gap-2 mt-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={session.muteAudio || false}
                  onChange={e => {
                    const muteAudio = e.target.checked;
                    setSession({ ...session, muteAudio, updatedAt: Date.now() });
                    debouncedSave({ muteAudio });
                  }}
                  className="w-3.5 h-3.5 rounded"
                />
                <span className="text-xs" style={{ color: 'var(--text2)' }}>Mute audio</span>
              </label>
            </div>
            <button
              onClick={startExport}
              disabled={exporting || session.status === 'exporting'}
              className="text-xs px-5 py-2 rounded-lg font-medium text-white disabled:opacity-50 flex items-center gap-1.5"
              style={{ background: 'var(--accent)' }}
            >
              {exporting || session.status === 'exporting' ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: 'white', borderTopColor: 'transparent' }} />
                  Exporting...
                </>
              ) : (
                <>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <rect x="2" y="3" width="20" height="14" rx="2" /><polygon points="10 8 16 11 10 14 10 8" />
                  </svg>
                  Export
                </>
              )}
            </button>
          </div>
          {session.status === 'error' && session.error && (
            <div className="mt-3 p-2 rounded-lg text-xs" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red, #ef4444)' }}>
              {session.error}
            </div>
          )}

          {/* Version History */}
          {session.exports && session.exports.length > 0 && (
            <div className="mt-4 pt-3 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => setVersionHistoryOpen(!versionHistoryOpen)}
                className="flex items-center gap-2 text-sm font-semibold mb-3 w-full"
                style={{ color: 'var(--text1)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${versionHistoryOpen ? 'rotate-90' : ''}`}>
                  <path d="M9 18l6-6-6-6" />
                </svg>
                Version History ({session.exports.length})
              </button>
              {versionHistoryOpen && (
                <div className="space-y-2">
                  {[...session.exports].reverse().map((exp, i) => {
                    const vNum = session.exports!.length - i;
                    const isLatest = i === 0;
                    return (
                      <div
                        key={exp.id}
                        className="rounded-lg border overflow-hidden"
                        style={{ borderColor: isLatest ? 'var(--accent)' : 'var(--border)', background: 'var(--bg)' }}
                      >
                        <div className="flex items-center gap-3 p-2">
                          <button
                            onClick={() => setPreviewUrl(exp.url)}
                            className="w-16 h-10 rounded overflow-hidden flex-shrink-0 relative group cursor-pointer"
                            style={{ background: 'var(--bg-input)' }}
                          >
                            <video src={exp.url} className="w-full h-full object-cover" muted />
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <svg viewBox="0 0 24 24" fill="white" className="w-4 h-4">
                                <polygon points="5 3 19 12 5 21 5 3" />
                              </svg>
                            </div>
                          </button>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <p className="text-xs font-medium" style={{ color: 'var(--text1)' }}>
                                Version {vNum}
                              </p>
                              {isLatest && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium" style={{ background: 'var(--accent)', color: 'white' }}>
                                  latest
                                </span>
                              )}
                            </div>
                            <p className="text-[10px]" style={{ color: 'var(--text3)' }}>
                              {new Date(exp.createdAt).toLocaleString()}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              onClick={async () => {
                                const res = await fetch(exp.url);
                                const blob = await res.blob();
                                const a = document.createElement('a');
                                a.href = URL.createObjectURL(blob);
                                a.download = `${session.name}-v${vNum}.mp4`;
                                a.click();
                                URL.revokeObjectURL(a.href);
                              }}
                              className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1"
                              style={{ background: 'var(--accent)', color: 'white' }}
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3">
                                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                              </svg>
                              Download
                            </button>
                            <button
                              onClick={() => setConfirmDeleteVersion({ id: exp.id, num: vNum })}
                              className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100"
                              style={{ color: 'var(--red)' }}
                              title="Delete version"
                            >
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Delete session confirmation */}
      {confirmDeleteSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteSession(false)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 w-80 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: 'var(--red)' }}>
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete export?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
              This export session and all its versions will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteSession(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/exports?id=${session!.id}`, { method: 'DELETE' });
                  router.push('/export');
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete version confirmation */}
      {confirmDeleteVersion && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteVersion(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 w-80 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'rgba(239,68,68,0.1)' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: 'var(--red)' }}>
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </div>
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete version {confirmDeleteVersion.num}?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
              This version will be permanently deleted from both the export history and gallery.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteVersion(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={async () => {
                  await fetch(`/api/exports?id=${session!.id}&versionId=${confirmDeleteVersion.id}`, { method: 'DELETE' });
                  setConfirmDeleteVersion(null);
                  load();
                }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                Delete
              </button>
            </div>
          </div>
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

            {/* Upload zone inside modal */}
            <div className="px-4 pt-2">
              <div
                className="rounded-lg border-2 border-dashed p-3 text-center cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={e => { e.preventDefault(); e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onDragLeave={e => { e.currentTarget.style.borderColor = ''; }}
                onDrop={async e => {
                  e.preventDefault();
                  e.currentTarget.style.borderColor = '';
                  const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
                  for (const f of files) await addUploadedClip(f);
                }}
              >
                <p className="text-xs" style={{ color: 'var(--text3)' }}>
                  {uploading ? 'Uploading...' : 'Drop video files here or click to upload from device'}
                </p>
              </div>
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
                    const isSelected = browserSelected.has(gen.id);
                    return (
                      <div
                        key={gen.id}
                        className={`rounded-lg border-2 overflow-hidden transition-colors ${alreadyAdded ? 'opacity-50' : 'cursor-pointer'}`}
                        style={{ borderColor: isSelected ? 'var(--accent)' : 'var(--border)' }}
                        onClick={() => {
                          if (alreadyAdded) return;
                          setBrowserSelected(prev => {
                            const next = new Set(prev);
                            if (next.has(gen.id)) next.delete(gen.id);
                            else next.add(gen.id);
                            return next;
                          });
                        }}
                      >
                        <div className="aspect-video relative" style={{ background: 'var(--bg-input)' }}>
                          <video src={gen.resultUrls[0]} className="w-full h-full object-cover" muted />
                          {(alreadyAdded || isSelected) && (
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
                onClick={async () => {
                  if (!session) return;
                  const toAdd = browserVideos.filter(g => browserSelected.has(g.id));
                  const newClips: ExportClip[] = [];
                  for (const gen of toAdd) {
                    const dur = await probeDuration(gen.resultUrls[0]);
                    newClips.push({
                      id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      generationId: gen.id,
                      projectId: gen.projectId,
                      url: gen.resultUrls[0],
                      label: clipLabel(gen),
                      duration: dur > 0 ? Math.round(dur * 10) / 10 : undefined,
                      source: 'generation',
                      transform: { offsetX: 0, offsetY: 0, scale: 1 },
                    });
                  }
                  const clips = [...session.clips, ...newClips];
                  setSession({ ...session, clips, updatedAt: Date.now() });
                  debouncedSave({ clips });
                  setShowBrowser(false);
                }}
                disabled={browserSelected.size === 0}
                className="px-5 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--accent)' }}
              >
                Add {browserSelected.size > 0 ? `(${browserSelected.size})` : ''}
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
