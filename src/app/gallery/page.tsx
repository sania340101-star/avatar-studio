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

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (filterProjectId !== 'all') params.set('projectId', filterProjectId);
    if (tab !== 'all') params.set('type', tab);
    const res = await fetch(`/api/generations?${params}`);
    const data = await res.json();
    if (Array.isArray(data)) setGenerations(data);
  }, [filterProjectId, tab]);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(gen: Generation) {
    await fetch(`/api/generations?projectId=${gen.projectId}&generationId=${gen.id}`, { method: 'DELETE' });
    load();
  }

  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.title]));

  const tabs: { id: TabFilter; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'image', label: 'Images' },
    { id: 'video', label: 'Videos' },
  ];

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

      {generations.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text2)' }}>No generations yet</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Go to Generate Image or Video to create your first generation.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {generations.map(gen => (
            <div key={gen.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-3">
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
                  onClick={() => handleDelete(gen)}
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
          ))}
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
