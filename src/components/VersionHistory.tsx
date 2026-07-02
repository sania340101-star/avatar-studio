'use client';

import { useState, useCallback } from 'react';
import { Generation } from '@/lib/types';
import ConfirmDialog from '@/components/ConfirmDialog';

interface Props {
  generations: Generation[];
  onSelect: (gen: Generation) => void;
  onDelete?: (genId: string) => void;
}

function formatCost(cost: { amount?: number | null; currency?: string; details?: string } | undefined | null): string | null {
  if (!cost || cost.amount == null) return null;
  return `$${cost.amount.toFixed(2)}`;
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

function Thumb({ src, type, className }: { src: string; type: 'image' | 'video' | 'export'; className?: string }) {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-red-500/10 ${className ?? ''}`}>
        <span className="text-xs text-center px-1" style={{ color: 'var(--red, #ef4444)' }}>Failed to load</span>
      </div>
    );
  }

  return (
    <div className={`relative ${className ?? ''}`}>
      {!loaded && (
        <div className="absolute inset-0 flex items-center justify-center" style={{ background: 'var(--bg-input)' }}>
          <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
        </div>
      )}
      {type === 'image' ? (
        <img
          src={src}
          alt=""
          className={`w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      ) : (
        <video
          src={src}
          className={`w-full h-full object-cover transition-opacity ${loaded ? 'opacity-100' : 'opacity-0'}`}
          muted
          onLoadedData={() => setLoaded(true)}
          onError={() => setError(true)}
        />
      )}
    </div>
  );
}

export default function VersionHistory({ generations, onSelect, onDelete }: Props) {
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [lightbox, setLightbox] = useState<{ url: string; type: 'image' | 'video' | 'export' } | null>(null);

  const closeLightbox = useCallback(() => setLightbox(null), []);

  if (generations.length === 0) return null;

  type HistoryEntry =
    | { kind: 'single'; gen: Generation }
    | { kind: 'batch'; batchId: string; gens: Generation[]; templateName: string };

  const entries: HistoryEntry[] = [];
  const batchMap = new Map<string, Generation[]>();
  for (const gen of generations) {
    if (gen.batchId) {
      const arr = batchMap.get(gen.batchId) || [];
      arr.push(gen);
      batchMap.set(gen.batchId, arr);
    } else {
      entries.push({ kind: 'single', gen });
    }
  }
  for (const [bid, gens] of batchMap) {
    const sorted = gens.sort((a, b) => {
      const ai = (a.params.slotIndex as number) ?? 0;
      const bi = (b.params.slotIndex as number) ?? 0;
      return ai - bi;
    });
    entries.push({
      kind: 'batch',
      batchId: bid,
      gens: sorted,
      templateName: String(sorted[0].params.templateName || 'Batch'),
    });
  }
  entries.sort((a, b) => {
    const ta = a.kind === 'single' ? a.gen.createdAt : Math.max(...a.gens.map(g => g.createdAt));
    const tb = b.kind === 'single' ? b.gen.createdAt : Math.max(...b.gens.map(g => g.createdAt));
    return tb - ta;
  });

  const toggleCard = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  const entryId = (e: HistoryEntry) => e.kind === 'single' ? e.gen.id : e.batchId;

  function renderSingleCard(gen: Generation, versionNum: number) {
    const isExpanded = expandedId === gen.id;
    const costLabel = formatCost(gen.actualCost) || (gen.estimatedCost ? `~${formatCost(gen.estimatedCost)}` : null);

    return (
      <div
        key={gen.id}
        className="rounded-xl border transition-colors"
        style={{
          borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
          background: 'var(--bg-card)',
        }}
      >
        <div
          className="flex items-center gap-3 p-3 cursor-pointer"
          onClick={() => toggleCard(gen.id)}
        >
          {gen.resultUrls[0] && (
            <Thumb src={gen.resultUrls[0]} type={gen.type} className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden" />
          )}

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                v{versionNum}
              </span>
              <span className="text-xs truncate max-w-[120px] sm:max-w-none" style={{ color: 'var(--text3)' }}>
                {gen.modelLabel}
              </span>
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

          {onDelete && (
            <button
              onClick={e => { e.stopPropagation(); setConfirmDeleteId(gen.id); }}
              className="w-7 h-7 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 flex-shrink-0"
              style={{ color: 'var(--red)' }}
              aria-label="Delete"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5" aria-hidden="true">
                <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            style={{ color: 'var(--text3)' }}
            aria-hidden="true"
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

              {gen.params.instruction ? (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>Instruction</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.instruction)}</p>
                </div>
              ) : null}

              {gen.params.agentReasoning ? (
                <div className="p-3 rounded-lg" style={{ background: 'rgba(76,175,80,0.08)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>Agent Reasoning</p>
                  <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.agentReasoning)}</p>
                </div>
              ) : null}

              <div className="flex flex-wrap gap-2">
                {gen.params.size != null && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                    Size: {String(gen.params.size)}
                  </span>
                )}
                {gen.params.format != null && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                    Format: {String(gen.params.format)}
                  </span>
                )}
                {gen.params.count != null && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                    Count: {String(gen.params.count)}
                  </span>
                )}
                {gen.params.duration != null && (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                    Duration: {String(gen.params.duration)}s
                  </span>
                )}
                <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                  Model: {gen.modelLabel}
                </span>
                {formatCost(gen.actualCost) ? (
                  <span className="text-xs px-2 py-1 rounded font-medium" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                    Cost: {formatCost(gen.actualCost)}
                  </span>
                ) : formatCost(gen.estimatedCost) ? (
                  <span className="text-xs px-2 py-1 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                    ~{formatCost(gen.estimatedCost)}
                  </span>
                ) : null}
              </div>

              {gen.resultUrls.length > 0 && (
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>
                    Results ({gen.resultUrls.length})
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {gen.resultUrls.map((url, j) => {
                      const ext = gen.type === 'image' ? 'png' : 'mp4';
                      const fname = `v${versionNum}-${j + 1}.${ext}`;
                      return (
                        <div key={j} className="flex flex-col items-center gap-1">
                          <button
                            onClick={(e) => { e.stopPropagation(); setLightbox({ url, type: gen.type }); }}
                            className="group relative rounded-lg overflow-hidden cursor-zoom-in"
                            aria-label="Preview"
                          >
                            <Thumb
                              src={url}
                              type={gen.type}
                              className={gen.type === 'image' ? 'w-24 h-24' : 'w-32 h-24'}
                            />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                                <path d="M11 8v6M8 11h6" />
                              </svg>
                            </div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadUrl(url, fname); }}
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

              <div className="flex justify-end">
                <button
                  onClick={(e) => { e.stopPropagation(); onSelect(gen); }}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium hover:opacity-80 transition-opacity"
                  style={{ border: '1px solid var(--accent)', color: 'var(--accent)', background: 'transparent' }}
                >
                  Load Parameters
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderBatchCard(entry: Extract<HistoryEntry, { kind: 'batch' }>, versionNum: number) {
    const isExpanded = expandedId === entry.batchId;
    let totalCost = 0;
    let hasCost = false;
    for (const g of entry.gens) {
      const c = g.actualCost?.amount ?? g.estimatedCost?.amount;
      if (c != null) { totalCost += c; hasCost = true; }
    }
    const costLabel = hasCost ? `$${totalCost.toFixed(2)}` : null;
    const models = [...new Set(entry.gens.map(g => g.modelLabel))];

    return (
      <div
        key={entry.batchId}
        className="rounded-xl border transition-colors"
        style={{
          borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
          background: 'var(--bg-card)',
        }}
      >
        <div
          className="flex items-center gap-3 p-3 cursor-pointer"
          onClick={() => toggleCard(entry.batchId)}
        >
          <div className="w-14 h-14 rounded-lg flex-shrink-0 overflow-hidden flex items-center justify-center" style={{ background: 'var(--accent-subtle)' }}>
            <div className="grid grid-cols-2 gap-0.5 w-12 h-12 p-1">
              {entry.gens.slice(0, 4).map((g, j) => (
                g.resultUrls[0]
                  ? <Thumb key={j} src={g.resultUrls[0]} type={g.type} className="rounded-sm overflow-hidden" />
                  : <div key={j} className="rounded-sm" style={{ background: 'var(--border)' }} />
              ))}
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                v{versionNum}
              </span>
              <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(76,175,80,0.12)', color: 'var(--green)' }}>
                {entry.gens.length} slots
              </span>
              <span className="text-xs hidden sm:inline" style={{ color: 'var(--text3)' }}>
                {new Date(Math.max(...entry.gens.map(g => g.createdAt))).toLocaleString()}
              </span>
              {costLabel && (
                <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                  {costLabel}
                </span>
              )}
            </div>
            <p className="text-sm truncate font-medium" style={{ color: 'var(--text1)' }}>{entry.templateName}</p>
            {models.length <= 2 && (
              <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{models.join(', ')}</p>
            )}
          </div>

          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
            className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            style={{ color: 'var(--text3)' }}
            aria-hidden="true"
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
                  const slotCost = formatCost(gen.actualCost) || (gen.estimatedCost ? `~${formatCost(gen.estimatedCost)}` : null);
                  return (
                    <div key={gen.id} className="rounded-lg border p-2 space-y-2" style={{ borderColor: 'var(--border)', background: 'var(--bg)' }}>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                          #{slotIdx + 1}
                        </span>
                        <span className="text-xs truncate" style={{ color: 'var(--text3)' }}>{gen.modelLabel}</span>
                        {slotCost && (
                          <span className="text-xs font-medium ml-auto px-1.5 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                            {slotCost}
                          </span>
                        )}
                      </div>

                      {gen.resultUrls[0] && (
                        <div className="relative group rounded-lg overflow-hidden">
                          <button
                            onClick={(e) => { e.stopPropagation(); setLightbox({ url: gen.resultUrls[0], type: gen.type }); }}
                            className="w-full cursor-zoom-in"
                            aria-label="Preview"
                          >
                            <Thumb src={gen.resultUrls[0]} type={gen.type} className="w-full aspect-video" />
                            <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                              <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" className="w-5 h-5" aria-hidden="true">
                                <circle cx="11" cy="11" r="8" />
                                <path d="M21 21l-4.35-4.35" />
                                <path d="M11 8v6M8 11h6" />
                              </svg>
                            </div>
                          </button>
                          <button
                            onClick={(e) => { e.stopPropagation(); downloadUrl(gen.resultUrls[0], `batch-slot-${slotIdx + 1}.${gen.type === 'video' ? 'mp4' : 'png'}`); }}
                            className="absolute bottom-2 right-2 text-xs px-2 py-0.5 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                            style={{ background: 'var(--accent)', color: 'white' }}
                          >
                            Download
                          </button>
                        </div>
                      )}

                      {gen.params.instruction != null && (
                        <p className="text-xs" style={{ color: 'var(--text2)' }}>{String(gen.params.instruction)}</p>
                      )}

                      <div className="flex flex-wrap gap-1">
                        {gen.params.duration != null && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.duration)}s</span>
                        )}
                        {gen.params.aspectRatio != null && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.aspectRatio)}</span>
                        )}
                        {gen.params.quality != null && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.quality)}</span>
                        )}
                        {gen.params.fps != null && (
                          <span className="text-xs px-1.5 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>{String(gen.params.fps)}fps</span>
                        )}
                      </div>

                      <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{gen.prompt}</p>
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

  return (
    <div className="mt-8">
      <button
        onClick={() => setSectionExpanded(!sectionExpanded)}
        className="flex items-center gap-2 text-lg font-semibold mb-4"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${sectionExpanded ? 'rotate-90' : ''}`} aria-hidden="true">
          <path d="M9 18l6-6-6-6" />
        </svg>
        Version History ({entries.length})
      </button>

      {sectionExpanded && (
        <div className="space-y-3">
          {entries.map((entry, i) => {
            const versionNum = entries.length - i;
            if (entry.kind === 'batch') {
              return renderBatchCard(entry, versionNum);
            }
            return renderSingleCard(entry.gen, versionNum);
          })}
        </div>
      )}

      {confirmDeleteId && onDelete && (
        <ConfirmDialog
          open={true}
          onClose={() => setConfirmDeleteId(null)}
          onConfirm={() => { onDelete(confirmDeleteId); setConfirmDeleteId(null); }}
          title="Delete generation?"
          description="This will permanently remove this version from history. This action cannot be undone."
        />
      )}

      {lightbox && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center"
          style={{ background: 'rgba(0,0,0,0.85)' }}
          onClick={closeLightbox}
        >
          <div className="absolute top-4 right-4 flex items-center gap-6 z-10">
            <button
              onClick={(e) => { e.stopPropagation(); downloadUrl(lightbox.url, lightbox.type === 'image' ? 'image.png' : 'video.mp4'); }}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Download"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7" aria-hidden="true">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={closeLightbox}
              className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
              aria-label="Close"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8" aria-hidden="true">
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
