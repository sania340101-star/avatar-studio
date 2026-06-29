'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Generation } from '@/lib/types';

type TabFilter = 'all' | 'image' | 'video';

function GalleryContent() {
  const { projects, activeProject } = useProject();
  const [tab, setTab] = useState<TabFilter>('all');
  const [filterProjectId, setFilterProjectId] = useState<string>('all');
  const [generations, setGenerations] = useState<Generation[]>([]);

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
                {(gen.actualCost || gen.estimatedCost) && (
                  <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ background: 'rgba(108,60,224,0.1)', color: 'var(--accent)' }}>
                    {gen.actualCost ? `$${gen.actualCost.amount.toFixed(2)}` : `~$${gen.estimatedCost!.amount.toFixed(2)}`}
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
                    <a key={i} href={url} target="_blank" rel="noopener noreferrer"
                      className="rounded-lg overflow-hidden border hover:border-[var(--accent)] transition-colors"
                      style={{ borderColor: 'var(--border)' }}>
                      <img src={url} alt="" className="w-full aspect-square object-cover" />
                    </a>
                  ))}
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {gen.resultUrls.map((url, i) => (
                    <div key={i} className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <video src={url} controls className="w-full" />
                    </div>
                  ))}
                </div>
              )}

              {Object.keys(gen.params).length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {Object.entries(gen.params).map(([k, v]) => v != null && (
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
    </div>
  );
}

export default function GalleryPage() {
  return <AppShell><GalleryContent /></AppShell>;
}
