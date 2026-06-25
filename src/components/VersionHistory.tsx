'use client';

import { useState } from 'react';
import { Generation } from '@/lib/types';

interface Props {
  generations: Generation[];
  onSelect: (gen: Generation) => void;
  onDelete?: (genId: string) => void;
}

export default function VersionHistory({ generations, onSelect, onDelete }: Props) {
  const [expanded, setExpanded] = useState(true);

  if (generations.length === 0) return null;

  return (
    <div className="mt-8">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-lg font-semibold mb-4"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}>
          <path d="M9 18l6-6-6-6" />
        </svg>
        Version History ({generations.length})
      </button>

      {expanded && (
        <div className="space-y-3">
          {generations.map((gen, i) => (
            <div
              key={gen.id}
              className="rounded-xl border p-3 cursor-pointer hover:border-[var(--accent)] transition-colors"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}
              onClick={() => onSelect(gen)}
            >
              <div className="flex items-start gap-3">
                {gen.type === 'image' && gen.resultUrls[0] && (
                  <img src={gen.resultUrls[0]} alt="" className="w-14 h-14 rounded-lg object-cover flex-shrink-0" />
                )}
                {gen.type === 'video' && gen.resultUrls[0] && (
                  <video src={gen.resultUrls[0]} className="w-14 h-14 rounded-lg object-cover flex-shrink-0" muted />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                      v{generations.length - i}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text3)' }}>
                      {gen.modelLabel}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--text3)' }}>
                      {new Date(gen.createdAt).toLocaleString()}
                    </span>
                  </div>
                  <p className="text-sm truncate" style={{ color: 'var(--text2)' }}>{gen.prompt}</p>
                  {gen.resultUrls.length > 1 && (
                    <div className="flex gap-1 mt-2">
                      {gen.resultUrls.slice(0, 6).map((url, j) => (
                        <img key={j} src={url} alt="" className="w-8 h-8 rounded object-cover" />
                      ))}
                      {gen.resultUrls.length > 6 && (
                        <span className="w-8 h-8 rounded flex items-center justify-center text-xs" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                          +{gen.resultUrls.length - 6}
                        </span>
                      )}
                    </div>
                  )}
                </div>
                {onDelete && (
                  <button
                    onClick={e => { e.stopPropagation(); onDelete(gen.id); }}
                    className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100"
                    style={{ color: 'var(--red)' }}
                  >
                    Del
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
