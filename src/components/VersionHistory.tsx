'use client';

import { useState } from 'react';
import { Generation } from '@/lib/types';

interface Props {
  generations: Generation[];
  onSelect: (gen: Generation) => void;
  onDelete?: (genId: string) => void;
}

export default function VersionHistory({ generations, onSelect, onDelete }: Props) {
  const [sectionExpanded, setSectionExpanded] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (generations.length === 0) return null;

  const toggleCard = (id: string) => {
    setExpandedId(prev => (prev === id ? null : id));
  };

  return (
    <div className="mt-8">
      <button
        onClick={() => setSectionExpanded(!sectionExpanded)}
        className="flex items-center gap-2 text-lg font-semibold mb-4"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${sectionExpanded ? 'rotate-90' : ''}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        Version History ({generations.length})
      </button>

      {sectionExpanded && (
        <div className="space-y-3">
          {generations.map((gen, i) => {
            const isExpanded = expandedId === gen.id;

            return (
              <div
                key={gen.id}
                className="rounded-xl border transition-colors"
                style={{
                  borderColor: isExpanded ? 'var(--accent)' : 'var(--border)',
                  background: 'var(--bg-card)',
                }}
              >
                {/* Collapsed header row - click to expand/collapse */}
                <div
                  className="flex items-center gap-3 p-3 cursor-pointer"
                  onClick={() => toggleCard(gen.id)}
                >
                  {/* Thumbnail */}
                  {gen.type === 'image' && gen.resultUrls[0] && (
                    <img src={gen.resultUrls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                  )}
                  {gen.type === 'video' && gen.resultUrls[0] && (
                    <video src={gen.resultUrls[0]} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" muted />
                  )}

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 mb-1">
                      <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                        v{generations.length - i}
                      </span>
                      <span className="text-xs truncate max-w-[120px] sm:max-w-none" style={{ color: 'var(--text3)' }}>
                        {gen.modelLabel}
                      </span>
                      <span className="text-xs hidden sm:inline" style={{ color: 'var(--text3)' }}>
                        {new Date(gen.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <p className="text-sm truncate" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>
                  </div>

                  {/* Delete button */}
                  {onDelete && (
                    <button
                      onClick={e => { e.stopPropagation(); onDelete(gen.id); }}
                      className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 flex-shrink-0"
                      style={{ color: 'var(--red)' }}
                    >
                      Del
                    </button>
                  )}

                  {/* Expand/collapse chevron */}
                  <svg
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                    style={{ color: 'var(--text3)' }}
                  >
                    <path d="M9 18l6-6-6-6" />
                  </svg>
                </div>

                {/* Expanded details */}
                {isExpanded && (
                  <div className="px-3 pb-3">
                    <div className="pt-3 border-t space-y-3" style={{ borderColor: 'var(--border)' }}>
                      {/* Full prompt */}
                      <div>
                        <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>Prompt</p>
                        <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>
                      </div>

                      {/* Instruction */}
                      {gen.params.instruction ? (
                        <div>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>Instruction</p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.instruction)}</p>
                        </div>
                      ) : null}

                      {/* Agent reasoning */}
                      {gen.params.agentReasoning ? (
                        <div className="p-3 rounded-lg" style={{ background: 'rgba(76,175,80,0.08)' }}>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>Agent Reasoning</p>
                          <p className="text-sm whitespace-pre-wrap" style={{ color: 'var(--text2)' }}>{String(gen.params.agentReasoning)}</p>
                        </div>
                      ) : null}

                      {/* Key params */}
                      <div className="flex flex-wrap gap-2">
                        {gen.params.size != null ? (
                          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                            Size: {String(gen.params.size)}
                          </span>
                        ) : null}
                        {gen.params.format != null ? (
                          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                            Format: {String(gen.params.format)}
                          </span>
                        ) : null}
                        {gen.params.count != null ? (
                          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                            Count: {String(gen.params.count)}
                          </span>
                        ) : null}
                        {gen.params.duration != null ? (
                          <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                            Duration: {String(gen.params.duration)}s
                          </span>
                        ) : null}
                        <span className="text-xs px-2 py-1 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                          Model: {gen.modelLabel}
                        </span>
                      </div>

                      {/* Result thumbnails grid */}
                      {gen.resultUrls.length > 0 && (
                        <div>
                          <p className="text-xs font-medium mb-1" style={{ color: 'var(--text3)' }}>
                            Results ({gen.resultUrls.length})
                          </p>
                          <div className="flex flex-wrap gap-1">
                            {gen.resultUrls.map((url, j) => (
                              gen.type === 'image'
                                ? <img key={j} src={url} alt="" className="w-16 h-16 rounded object-cover" />
                                : <video key={j} src={url} className="w-24 h-16 rounded object-cover" muted />
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Load button */}
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelect(gen); }}
                        className="px-4 py-2 rounded-lg text-sm font-semibold text-white hover:opacity-90 transition-opacity"
                        style={{ background: 'var(--accent)' }}
                      >
                        Load Parameters
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
