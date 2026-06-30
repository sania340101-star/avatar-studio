'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Generation } from '@/lib/types';

type TabFilter = 'all' | 'image' | 'video';

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

function GalleryContent() {
  const { projects, activeProject } = useProject();
  const [tab, setTab] = useState<TabFilter>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkDeleting, setBulkDeleting] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProjectId !== 'all') params.set('projectId', filterProjectId);
    if (tab !== 'all') params.set('type', tab);
    const res = await fetch(`/api/generations?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setGenerations(data);
  }, [filterProjectId, tab]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelectedIds(new Set()); }, [filterProjectId, tab]);

  function toggleSelect(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll() {
    setSelectedIds(new Set(generations.map(g => g.id)));
  }

  async function handleDelete(gen: Generation) {
    await fetch(`/api/generations?projectId=${gen.projectId}&generationId=${gen.id}`, { method: 'DELETE' });
    load();
  }

  async function handleBulkDelete() {
    setBulkDeleting(true);
    const selected = generations.filter(g => selectedIds.has(g.id));
    await Promise.all(selected.map(gen =>
      fetch(`/api/generations?projectId=${gen.projectId}&generationId=${gen.id}`, { method: 'DELETE' })
    ));
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setBulkDeleting(false);
    load();
  }

  async function handleBulkDownload() {
    const selected = generations.filter(g => selectedIds.has(g.id));
    let fileIdx = 0;
    for (const gen of selected) {
      for (const url of gen.resultUrls) {
        fileIdx++;
        const ext = gen.type === 'image' ? 'png' : 'mp4';
        await downloadUrl(url, `${gen.type}-${fileIdx}.${ext}`);
      }
    }
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.title]));

  const tabs: { id: TabFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
  ];

  const hasSelection = selectedIds.size > 0;
  const allSelected = generations.length > 0 && selectedIds.size === generations.length;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Gallery</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>All your generations across projects</p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="flex gap-2">
          {tabs.map(t => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className="px-4 py-2 rounded-lg text-sm font-medium transition-colors"
              style={{
                background: tab === t.id ? 'var(--accent)' : 'var(--bg-input)',
                color: tab === t.id ? 'white' : 'var(--text2)',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>
        <select
          value={filterProjectId}
          onChange={e => setFilterProjectId(e.target.value)}
          className="text-sm px-3 py-2 rounded-lg border"
          style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
        >
          <option value="all">All Projects</option>
          {projects.map(p => (
            <option key={p.id} value={p.id}>{p.title}</option>
          ))}
        </select>
      </div>

      {/* Bulk action toolbar */}
      {hasSelection && (
        <div
          className="sticky top-0 z-20 flex flex-wrap items-center gap-3 px-4 py-3 mb-4 rounded-xl shadow-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
        >
          <span className="text-sm font-medium" style={{ color: 'var(--text1)' }}>
            {selectedIds.size} selected
          </span>
          <button
            onClick={allSelected ? () => setSelectedIds(new Set()) : selectAll}
            className="text-xs px-3 py-1.5 rounded-lg font-medium"
            style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
          >
            {allSelected ? 'Deselect All' : 'Select All'}
          </button>
          <div className="flex-1" />
          <button
            onClick={handleBulkDownload}
            className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5"
            style={{ background: 'var(--accent)', color: 'white' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Download
          </button>
          <button
            onClick={() => setConfirmBulkDelete(true)}
            className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 text-white"
            style={{ background: 'var(--red, #ef4444)' }}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
              <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
            </svg>
            Delete
          </button>
          <button
            onClick={() => setSelectedIds(new Set())}
            className="text-xs px-1.5 py-1.5"
            style={{ color: 'var(--text3)' }}
            title="Clear selection"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 6L6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {generations.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text2)' }}>No generations yet</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Go to Generate Image or Video to create your first generation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {generations.map(gen => {
            const isSelected = selectedIds.has(gen.id);
            return (
              <div
                key={gen.id}
                className="rounded-xl border p-4 transition-colors"
                style={{
                  borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                  background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-card)',
                }}
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
                  <button
                    onClick={() => toggleSelect(gen.id)}
                    className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                    style={{
                      borderColor: isSelected ? 'var(--accent)' : 'var(--border)',
                      background: isSelected ? 'var(--accent)' : 'transparent',
                    }}
                  >
                    {isSelected && (
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    )}
                  </button>
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                    background: gen.type === 'image' ? 'rgba(76,175,80,0.15)' : 'rgba(108,60,224,0.15)',
                    color: gen.type === 'image' ? 'var(--green)' : 'var(--accent)',
                  }}>
                    {gen.type}
                  </span>
                  <span className="text-sm font-medium truncate">{gen.modelLabel}</span>
                  {filterProjectId === 'all' && projectMap[gen.projectId] && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                      {projectMap[gen.projectId]}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--text3)' }}>
                    {new Date(gen.createdAt).toLocaleString()}
                  </span>
                  {(gen.actualCost?.amount != null || gen.estimatedCost?.amount != null) && (
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                      {gen.actualCost?.amount != null ? `$${gen.actualCost.amount.toFixed(2)}` : `~$${gen.estimatedCost!.amount!.toFixed(2)}`}
                    </span>
                  )}
                  <button
                    onClick={() => setConfirmDeleteId(gen.id)}
                    className="ml-auto text-xs px-2 py-1 rounded opacity-50 hover:opacity-100"
                    style={{ color: 'var(--red)' }}
                  >
                    Delete
                  </button>
                </div>

                <p className="text-sm mb-3 line-clamp-3" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>

                {gen.type === 'image' ? (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2">
                    {gen.resultUrls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border hover:border-[var(--accent)] transition-colors"
                        style={{ borderColor: 'var(--border)' }}>
                        <button onClick={() => setLightbox({ url, type: 'image' })} className="w-full cursor-zoom-in">
                          <img src={url} alt="" className="w-full aspect-square object-cover" />
                        </button>
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end justify-center p-2 pointer-events-none">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadUrl(url, `image-${i + 1}.png`); }}
                            className="pointer-events-auto px-3 py-1 rounded text-xs text-white font-medium"
                            style={{ background: 'var(--accent)' }}
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {gen.resultUrls.map((url, i) => (
                      <div key={i} className="relative group rounded-lg overflow-hidden border hover:border-[var(--accent)] transition-colors"
                        style={{ borderColor: 'var(--border)' }}>
                        <button onClick={() => setLightbox({ url, type: 'video' })} className="w-full cursor-zoom-in">
                          <video src={url} className="w-full pointer-events-none" />
                        </button>
                        <div className="absolute bottom-0 left-0 right-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center p-2 pointer-events-none">
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadUrl(url, `video-${i + 1}.mp4`); }}
                            className="pointer-events-auto px-3 py-1 rounded text-xs text-white font-medium"
                            style={{ background: 'var(--accent)' }}
                          >
                            Download
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {Object.keys(gen.params).length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {Object.entries(gen.params).map(([k, v]) => v != null && typeof v !== 'object' && (
                      <span key={k} className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                        {k}: {String(v)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Single delete confirmation */}
      {confirmDeleteId && (() => {
        const gen = generations.find(g => g.id === confirmDeleteId);
        if (!gen) return null;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteId(null)}>
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
              <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete generation?</h3>
              <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
                This {gen.type} generation will be permanently deleted.
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium"
                  style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
                >
                  Cancel
                </button>
                <button
                  onClick={() => { handleDelete(gen); setConfirmDeleteId(null); }}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--red, #ef4444)' }}
                >
                  Delete
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Bulk delete confirmation */}
      {confirmBulkDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmBulkDelete(false)}>
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
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete {selectedIds.size} generation{selectedIds.size !== 1 ? 's' : ''}?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
              This action cannot be undone.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmBulkDelete(false)}
                disabled={bulkDeleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                {bulkDeleting ? 'Deleting...' : 'Delete All'}
              </button>
            </div>
          </div>
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
              onClick={(e) => { e.stopPropagation(); downloadUrl(lightbox.url, lightbox.type === 'image' ? 'image.png' : 'video.mp4'); }}
              className="text-white/70 hover:text-white transition-colors"
              title="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => setLightbox(null)}
              className="text-white/70 hover:text-white transition-colors"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            {lightbox.type === 'image' ? (
              <img src={lightbox.url} alt="" className="max-w-full max-h-[90vh] object-contain rounded-lg" />
            ) : (
              <video src={lightbox.url} className="max-w-full max-h-[90vh] object-contain rounded-lg" controls autoPlay />
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default function GalleryPage() {
  return <AppShell><GalleryContent /></AppShell>;
}
