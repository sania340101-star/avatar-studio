'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Generation } from '@/lib/types';

type TabFilter = 'all' | 'image' | 'video' | 'export';

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
  const router = useRouter();
  const { projects, activeProject } = useProject();
  const [tab, setTab] = useState<TabFilter>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' | 'export' } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
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

  async function handleExportSelected() {
    const selected = generations.filter(g => selectedIds.has(g.id) && g.type === 'video' && g.resultUrls.length > 0);
    if (selected.length === 0) return;
    const clips = selected.map((gen, i) => ({
      id: `clip-${Date.now()}-${i}`,
      generationId: gen.id,
      projectId: gen.projectId,
      url: gen.resultUrls[0],
      label: gen.prompt.slice(0, 60) || `Clip ${i + 1}`,
      transform: { offsetX: 0, offsetY: 0, scale: 1 },
    }));
    const res = await fetch('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Export ${new Date().toLocaleDateString()}`, clips }),
    });
    if (res.ok) {
      const session = await res.json();
      router.push(`/export/${session.id}`);
    }
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.title]));

  const tabs: { id: TabFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
    { id: 'export', label: 'Exports' },
  ];

  type GalleryEntry =
    | { kind: 'single'; gen: Generation }
    | { kind: 'batch'; batchId: string; gens: Generation[]; templateName: string };

  const galleryEntries: GalleryEntry[] = [];
  const batchMap = new Map<string, Generation[]>();
  for (const gen of generations) {
    if (gen.batchId) {
      const arr = batchMap.get(gen.batchId) || [];
      arr.push(gen);
      batchMap.set(gen.batchId, arr);
    } else {
      galleryEntries.push({ kind: 'single', gen });
    }
  }
  for (const [bid, gens] of batchMap) {
    const sorted = gens.sort((a, b) => ((a.params.slotIndex as number) ?? 0) - ((b.params.slotIndex as number) ?? 0));
    galleryEntries.push({
      kind: 'batch',
      batchId: bid,
      gens: sorted,
      templateName: String(sorted[0].params.templateName || 'Batch'),
    });
  }
  galleryEntries.sort((a, b) => {
    const ta = a.kind === 'single' ? a.gen.createdAt : Math.max(...a.gens.map(g => g.createdAt));
    const tb = b.kind === 'single' ? b.gen.createdAt : Math.max(...b.gens.map(g => g.createdAt));
    return tb - ta;
  });

  function isBatchSelected(entry: Extract<GalleryEntry, { kind: 'batch' }>) {
    return entry.gens.every(g => selectedIds.has(g.id));
  }
  function toggleBatchSelect(entry: Extract<GalleryEntry, { kind: 'batch' }>) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allIn = entry.gens.every(g => next.has(g.id));
      for (const g of entry.gens) {
        if (allIn) next.delete(g.id); else next.add(g.id);
      }
      return next;
    });
  }

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
          className="sticky top-0 z-20 px-4 py-3 mb-4 rounded-xl shadow-lg"
          style={{ background: 'var(--bg-card)', border: '1px solid var(--accent)' }}
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium" style={{ color: 'var(--text1)' }}>
                {selectedIds.size} selected
              </span>
              <button
                onClick={allSelected ? () => setSelectedIds(new Set()) : selectAll}
                className="text-xs px-3 py-1.5 rounded-lg font-medium"
                style={{ background: 'var(--bg-input)', color: 'var(--text2)' }}
              >
                {allSelected ? 'Deselect' : 'All'}
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={handleBulkDownload}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5"
                style={{ background: 'var(--accent)', color: 'white' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                <span className="hidden sm:inline">Download</span>
              </button>
              <button
                onClick={handleExportSelected}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 text-white"
                style={{ background: 'var(--green, #22c55e)' }}
                title="Create export session from selected videos"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <rect x="2" y="3" width="20" height="14" rx="2" /><polygon points="10 8 16 11 10 14 10 8" />
                </svg>
                <span className="hidden sm:inline">Export</span>
              </button>
              <button
                onClick={() => setConfirmBulkDelete(true)}
                className="text-xs px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 text-white"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                  <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                </svg>
                <span className="hidden sm:inline">Delete</span>
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
          </div>
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
        <div className="space-y-3">
          {galleryEntries.map(entry => {
            if (entry.kind === 'batch') {
              const batchSelected = isBatchSelected(entry);
              const isExpanded = expandedId === entry.batchId;
              let totalCost = 0;
              let hasCost = false;
              for (const g of entry.gens) {
                const c = g.actualCost?.amount ?? g.estimatedCost?.amount;
                if (c != null) { totalCost += c; hasCost = true; }
              }
              const models = [...new Set(entry.gens.map(g => g.modelLabel))];
              return (
                <div
                  key={entry.batchId}
                  className="rounded-xl border transition-colors no-focus-ring"
                  style={{
                    borderColor: isExpanded ? 'var(--accent)' : batchSelected ? 'var(--accent)' : 'var(--border)',
                    background: batchSelected ? 'var(--accent-subtle)' : 'var(--bg-card)',
                    borderLeft: '3px solid var(--accent)',
                  }}
                >
                  <div className="flex items-center gap-3 p-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); toggleBatchSelect(entry); }}
                      className="w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0 transition-colors"
                      style={{
                        borderColor: batchSelected ? 'var(--accent)' : 'var(--border)',
                        background: batchSelected ? 'var(--accent)' : 'transparent',
                      }}
                    >
                      {batchSelected && (
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-3 h-3">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      )}
                    </button>

                    <div
                      className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center cursor-pointer"
                      style={{ background: 'var(--accent-subtle)' }}
                      onClick={() => setExpandedId(isExpanded ? null : entry.batchId)}
                    >
                      <div className="grid grid-cols-2 gap-0.5 w-12 h-12 p-1">
                        {entry.gens.slice(0, 4).map((g, j) => (
                          g.resultUrls[0]
                            ? <div key={j} className="rounded-sm overflow-hidden">
                                {g.type === 'video'
                                  ? <video src={g.resultUrls[0]} className="w-full h-full object-cover" muted />
                                  : <img src={g.resultUrls[0]} alt="" className="w-full h-full object-cover" />
                                }
                              </div>
                            : <div key={j} className="rounded-sm" style={{ background: 'var(--border)' }} />
                        ))}
                      </div>
                    </div>

                    <div
                      className="flex-1 min-w-0 cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : entry.batchId)}
                    >
                      <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                        <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.15)', color: 'var(--accent)' }}>
                          template
                        </span>
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(76,175,80,0.12)', color: 'var(--green)' }}>
                          {entry.gens.length} slots
                        </span>
                        {projectMap[entry.gens[0].projectId] && (
                          <span className="text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue, #3b82f6)' }}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 flex-shrink-0">
                              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                            </svg>
                            {projectMap[entry.gens[0].projectId]}
                          </span>
                        )}
                        <span className="text-xs hidden sm:inline" style={{ color: 'var(--text3)' }}>
                          {new Date(Math.max(...entry.gens.map(g => g.createdAt))).toLocaleString()}
                        </span>
                        {hasCost && (
                          <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                            ${totalCost.toFixed(2)}
                          </span>
                        )}
                      </div>
                      <p className="text-sm truncate font-medium" style={{ color: 'var(--text1)' }}>{entry.templateName}</p>
                      {models.length <= 2 && (
                        <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{models.join(', ')}</p>
                      )}
                    </div>

                    <button
                      onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(entry.batchId); }}
                      className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--red)' }}
                    >
                      Del
                    </button>

                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                      className={`w-4 h-4 flex-shrink-0 transition-transform cursor-pointer ${isExpanded ? 'rotate-90' : ''}`}
                      style={{ color: 'var(--text3)' }}
                      onClick={() => setExpandedId(isExpanded ? null : entry.batchId)}
                    >
                      <path d="M9 18l6-6-6-6" />
                    </svg>
                  </div>

                  {isExpanded && (
                    <div className="px-3 pb-3">
                      <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {entry.gens.map((gen, j) => {
                            const slotIdx = (gen.params.slotIndex as number) ?? j;
                            const slotCost = gen.actualCost?.amount != null
                              ? `$${gen.actualCost.amount.toFixed(2)}`
                              : gen.estimatedCost?.amount != null ? `~$${gen.estimatedCost.amount.toFixed(2)}` : null;
                            return (
                              <div key={gen.id} className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                                    #{slotIdx + 1}
                                  </span>
                                  <span className="text-xs truncate" style={{ color: 'var(--text3)' }}>{gen.modelLabel}</span>
                                  {gen.params.duration != null && (
                                    <span className="text-xs" style={{ color: 'var(--text3)' }}>{String(gen.params.duration)}s</span>
                                  )}
                                  {slotCost && (
                                    <span className="text-xs font-medium ml-auto px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                                      {slotCost}
                                    </span>
                                  )}
                                </div>

                                {gen.resultUrls[0] && (
                                  <div className="relative group rounded-lg overflow-hidden border hover:border-[var(--accent)] transition-colors" style={{ borderColor: 'var(--border)' }}>
                                    <button onClick={() => setLightbox({ url: gen.resultUrls[0], type: gen.type })} className="w-full cursor-zoom-in">
                                      {gen.type === 'video' ? (
                                        <video src={gen.resultUrls[0]} className="w-full pointer-events-none" muted />
                                      ) : (
                                        <img src={gen.resultUrls[0]} alt="" className="w-full aspect-video object-cover" />
                                      )}
                                    </button>
                                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex justify-center p-2 pointer-events-none">
                                      <button
                                        onClick={(e) => { e.stopPropagation(); downloadUrl(gen.resultUrls[0], `batch-slot-${slotIdx + 1}.${gen.type === 'video' ? 'mp4' : 'png'}`); }}
                                        className="pointer-events-auto px-3 py-1 rounded text-xs text-white font-medium"
                                        style={{ background: 'var(--accent)' }}
                                      >
                                        Download
                                      </button>
                                    </div>
                                  </div>
                                )}

                                {gen.params.instruction != null && (
                                  <p className="text-xs" style={{ color: 'var(--text2)' }}>{String(gen.params.instruction)}</p>
                                )}

                                <div className="flex flex-wrap gap-1">
                                  {gen.params.aspectRatio != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.aspectRatio)}</span>
                                  )}
                                  {gen.params.quality != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.quality)}</span>
                                  )}
                                  {gen.params.fps != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.fps)}fps</span>
                                  )}
                                  {gen.params.strategy != null && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.strategy)}</span>
                                  )}
                                </div>

                                <p className="text-xs line-clamp-2" style={{ color: 'var(--text3)' }}>{gen.prompt}</p>
                              </div>
                            );
                          })}
                        </div>

                        {hasCost && (
                          <div className="flex items-center justify-between text-xs pt-1">
                            <span style={{ color: 'var(--text3)' }}>Total cost</span>
                            <span className="font-semibold" style={{ color: 'var(--accent)' }}>${totalCost.toFixed(2)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            }

            const gen = entry.gen;
            const isSelected = selectedIds.has(gen.id);
            const isExpanded = expandedId === gen.id;
            const costLabel = gen.actualCost?.amount != null
              ? `$${gen.actualCost.amount.toFixed(2)}`
              : gen.estimatedCost?.amount != null ? `~$${gen.estimatedCost.amount.toFixed(2)}` : null;

            return (
              <div
                key={gen.id}
                className="rounded-xl border transition-colors no-focus-ring"
                style={{
                  borderColor: isExpanded ? 'var(--accent)' : isSelected ? 'var(--accent)' : 'var(--border)',
                  background: isSelected ? 'var(--accent-subtle)' : 'var(--bg-card)',
                }}
              >
                <div className="flex items-center gap-3 p-3">
                  <button
                    onClick={(e) => { e.stopPropagation(); toggleSelect(gen.id); }}
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

                  {gen.resultUrls[0] && (
                    <div
                      className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden cursor-pointer"
                      onClick={() => setExpandedId(isExpanded ? null : gen.id)}
                    >
                      {gen.type !== 'image' ? (
                        <video src={gen.resultUrls[0]} className="w-full h-full object-cover" muted />
                      ) : (
                        <img src={gen.resultUrls[0]} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                  )}

                  <div
                    className="flex-1 min-w-0 cursor-pointer"
                    onClick={() => setExpandedId(isExpanded ? null : gen.id)}
                  >
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{
                        background: gen.type === 'image' ? 'rgba(76,175,80,0.15)' : gen.type === 'export' ? 'rgba(245,158,11,0.15)' : 'rgba(108,60,224,0.15)',
                        color: gen.type === 'image' ? 'var(--green)' : gen.type === 'export' ? 'var(--orange, #f59e0b)' : 'var(--accent)',
                      }}>
                        {gen.type}
                      </span>
                      <span className="text-xs truncate max-w-[120px] sm:max-w-none" style={{ color: 'var(--text3)' }}>
                        {gen.modelLabel}
                      </span>
                      {projectMap[gen.projectId] && (
                        <span className="text-xs font-medium px-2 py-0.5 rounded flex items-center gap-1" style={{ background: 'rgba(59,130,246,0.12)', color: 'var(--blue, #3b82f6)' }}>
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3 flex-shrink-0">
                            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                          </svg>
                          {projectMap[gen.projectId]}
                        </span>
                      )}
                      <span className="text-xs hidden sm:inline" style={{ color: 'var(--text3)' }}>
                        {new Date(gen.createdAt).toLocaleString()}
                      </span>
                      {costLabel && (
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                          {costLabel}
                        </span>
                      )}
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>
                  </div>

                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(gen.id); }}
                    className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 flex-shrink-0"
                    style={{ color: 'var(--red)' }}
                  >
                    Del
                  </button>

                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
                    className={`w-4 h-4 flex-shrink-0 transition-transform cursor-pointer ${isExpanded ? 'rotate-90' : ''}`}
                    style={{ color: 'var(--text3)' }}
                    onClick={() => setExpandedId(isExpanded ? null : gen.id)}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

                {isExpanded && (
                  <div className="px-3 pb-3">
                    <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>Prompt</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>
                      </div>

                      {gen.params.instruction != null && (
                        <div>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>Instruction</p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.instruction)}</p>
                        </div>
                      )}

                      {gen.params.agentReasoning != null && (
                        <div className="p-3 rounded-lg" style={{ background: 'rgba(76,175,80,0.08)' }}>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>Agent Reasoning</p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.agentReasoning)}</p>
                        </div>
                      )}

                      <div className="flex flex-wrap gap-2">
                        {Object.entries(gen.params).map(([k, v]) => v != null && typeof v !== 'object' && !['instruction', 'agentReasoning', 'templateDefined'].includes(k) && (
                          <span key={k} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                            {k}: {String(v)}
                          </span>
                        ))}
                        <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                          Model: {gen.modelLabel}
                        </span>
                        {costLabel && (
                          <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                            Cost: {costLabel}
                          </span>
                        )}
                      </div>

                      {gen.resultUrls.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>
                            Results ({gen.resultUrls.length})
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {gen.resultUrls.map((url, i) => {
                              const ext = gen.type === 'image' ? 'png' : 'mp4';
                              const fname = `${gen.type}-${i + 1}.${ext}`;
                              return (
                                <div key={i} className="flex flex-col items-center gap-1">
                                  <button
                                    onClick={() => setLightbox({ url, type: gen.type })}
                                    className="group relative rounded-lg overflow-hidden cursor-zoom-in"
                                  >
                                    <div className={gen.type === 'image' ? 'w-24 h-24' : 'w-32 h-24'}>
                                      {gen.type !== 'image' ? (
                                        <video src={url} className="w-full h-full object-cover" muted />
                                      ) : (
                                        <img src={url} alt="" className="w-full h-full object-cover" />
                                      )}
                                    </div>
                                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-5 h-5">
                                        <circle cx="11" cy="11" r="8" />
                                        <path d="M21 21l-4.35-4.35" />
                                        <path d="M11 8v6M8 11h6" />
                                      </svg>
                                    </div>
                                  </button>
                                  <button
                                    onClick={() => downloadUrl(url, fname)}
                                    className="text-xs px-2 py-0.5 rounded hover:opacity-80 transition-opacity"
                                    style={{ background: 'var(--accent)', color: 'white' }}
                                  >
                                    Download
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Single / batch delete confirmation */}
      {confirmDeleteId && (() => {
        const gen = generations.find(g => g.id === confirmDeleteId);
        const batchGens = !gen ? batchMap.get(confirmDeleteId) : null;
        if (!gen && !batchGens) return null;
        const isBatch = !!batchGens;
        const count = isBatch ? batchGens!.length : 1;
        const typeName = isBatch ? `${count} template generations` : `${gen!.type} generation`;
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
              <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete {isBatch ? 'batch' : 'generation'}?</h3>
              <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
                {isBatch ? `All ${count} slots in this template batch` : `This ${gen!.type} generation`} will be permanently deleted.
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
                  onClick={async () => {
                    if (isBatch) {
                      await Promise.all(batchGens!.map(g => fetch(`/api/generations?projectId=${g.projectId}&generationId=${g.id}`, { method: 'DELETE' })));
                    } else {
                      await handleDelete(gen!);
                    }
                    setConfirmDeleteId(null);
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
          <div className="absolute top-4 right-4 flex items-center gap-6 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); downloadUrl(lightbox.url, lightbox.type === 'image' ? 'image.png' : `${lightbox.type}.mp4`); }}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              title="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => setLightbox(null)}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
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
