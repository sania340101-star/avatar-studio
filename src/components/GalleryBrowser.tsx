'use client';

import { useState, useEffect, useRef } from 'react';
import { Generation } from '@/lib/types';
import { useProject } from '@/lib/ProjectContext';

type AcceptType = 'image' | 'video' | 'all';

export interface GalleryItem {
  url: string;
  type: 'image' | 'video';
  name: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSelect: (items: GalleryItem[]) => void;
  accept?: AcceptType;
  multiple?: boolean;
}

export default function GalleryBrowser({ open, onClose, onSelect, accept = 'all', multiple = true }: Props) {
  const { projects, activeProject } = useProject();
  const [generations, setGenerations] = useState<Generation[]>([]);
  const [projectFilter, setProjectFilter] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest'>('newest');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(new Set());
    setUploadError('');
    setProjectFilter(activeProject?.id || 'all');
  }, [open, activeProject]);

  useEffect(() => {
    if (!open) return;
    const params = new URLSearchParams();
    if (projectFilter !== 'all') params.set('projectId', projectFilter);
    if (accept !== 'all') params.set('type', accept);
    fetch(`/api/generations?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setGenerations(data); });
  }, [open, projectFilter, accept]);

  if (!open) return null;

  const filtered = generations.filter(g => g.type !== 'export');
  const sorted = [...filtered].sort((a, b) =>
    sort === 'newest' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt
  );

  const items: { url: string; gen: Generation }[] = sorted.flatMap(g =>
    g.resultUrls.map(url => ({ url, gen: g }))
  );

  function toggleSelect(url: string) {
    if (!multiple) {
      const item = items.find(i => i.url === url);
      if (item) {
        onSelect([{ url: item.url, type: item.gen.type as 'image' | 'video', name: item.gen.modelLabel || 'Gallery' }]);
        onClose();
      }
      return;
    }
    const next = new Set(selected);
    if (next.has(url)) next.delete(url); else next.add(url);
    setSelected(next);
  }

  function handleAdd() {
    const result = items
      .filter(i => selected.has(i.url))
      .map(i => ({ url: i.url, type: i.gen.type as 'image' | 'video', name: i.gen.modelLabel || 'Gallery' }));
    onSelect(result);
    onClose();
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files?.length) return;
    setUploading(true);
    setUploadError('');
    const uploaded: GalleryItem[] = [];
    for (const file of Array.from(files)) {
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.url) {
          uploaded.push({ url: data.url, type: file.type.startsWith('video/') ? 'video' : 'image', name: file.name });
        } else if (data.error) {
          setUploadError(data.error);
        }
      } catch {
        setUploadError('Upload failed');
      }
    }
    if (uploaded.length) {
      onSelect(uploaded);
      onClose();
    }
    setUploading(false);
    e.target.value = '';
  }

  const fileAccept = accept === 'image' ? 'image/*' : accept === 'video' ? 'video/*' : 'image/*,video/*';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={onClose}>
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col rounded-2xl mx-3 sm:mx-0"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="text-lg font-semibold">Browse Gallery</h3>
          <button onClick={onClose} className="w-11 h-11 flex items-center justify-center rounded-lg" style={{ color: 'var(--text3)' }} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6"><path d="M18 6L6 18M6 6l12 12" /></svg>
          </button>
        </div>

        {/* Filters + Upload */}
        <div className="px-4 pt-3 pb-3 space-y-2.5 border-b" style={{ borderColor: 'var(--border)' }}>
          <div className="flex flex-wrap gap-2">
            {projects.length > 1 && (
              <select
                value={projectFilter}
                onChange={e => setProjectFilter(e.target.value)}
                className="text-sm px-3 py-1.5 rounded-lg border"
                style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
              >
                <option value="all">All Projects</option>
                {projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
              </select>
            )}
            <select
              value={sort}
              onChange={e => setSort(e.target.value as 'newest' | 'oldest')}
              className="text-sm px-3 py-1.5 rounded-lg border"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
            >
              <option value="newest">Newest first</option>
              <option value="oldest">Oldest first</option>
            </select>
          </div>

          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-2 rounded-lg border-2 border-dashed text-sm"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
          >
            {uploading ? 'Uploading...' : 'Upload from computer'}
          </button>
          <input ref={fileRef} type="file" accept={fileAccept} multiple={multiple} className="hidden" onChange={handleUpload} />
          {uploadError && <p className="text-xs" style={{ color: 'var(--red)' }}>{uploadError}</p>}
        </div>

        {/* Grid */}
        <div className="flex-1 overflow-auto p-4">
          {items.length > 0 ? (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {items.map(({ url, gen }) => {
                const isVideo = gen.type === 'video';
                const isSelected = selected.has(url);
                return (
                  <button
                    key={url}
                    onClick={() => toggleSelect(url)}
                    className="relative aspect-square rounded-lg overflow-hidden border-2 transition-colors"
                    style={{ borderColor: isSelected ? 'var(--accent)' : 'var(--border)' }}
                  >
                    {isVideo ? (
                      <>
                        <video src={url} className="w-full h-full object-cover pointer-events-none" preload="metadata" />
                        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                          <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6 opacity-70"><polygon points="5 3 19 12 5 21 5 3" /></svg>
                        </div>
                      </>
                    ) : (
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    )}
                    {accept === 'all' && (
                      <span className="absolute top-1 left-1 px-1.5 py-0.5 rounded text-[10px] font-medium" style={{ background: isVideo ? 'rgba(139,92,246,0.85)' : 'rgba(34,197,94,0.85)', color: 'white' }}>
                        {isVideo ? 'Video' : 'Image'}
                      </span>
                    )}
                    {isSelected && (
                      <div className="absolute top-1 right-1 w-6 h-6 rounded-full flex items-center justify-center" style={{ background: 'var(--accent)' }}>
                        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" className="w-4 h-4"><polyline points="20 6 9 17 4 12" /></svg>
                      </div>
                    )}
                    <div className="absolute bottom-0 left-0 right-0 bg-black/50 text-[10px] text-white px-1 py-0.5 truncate">
                      {gen.modelLabel}
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="text-sm text-center py-8" style={{ color: 'var(--text3)' }}>
              No {accept === 'image' ? 'images' : accept === 'video' ? 'videos' : 'items'} found. Generate some first or upload from computer.
            </p>
          )}
        </div>

        {/* Footer */}
        {multiple && (
          <div className="flex items-center justify-between p-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              {items.length} item{items.length !== 1 ? 's' : ''}{selected.size > 0 && ` · ${selected.size} selected`}
            </p>
            <div className="flex gap-2">
              <button onClick={onClose} className="px-4 py-2 rounded-lg text-sm" style={{ color: 'var(--text2)' }}>Cancel</button>
              <button
                onClick={handleAdd}
                disabled={selected.size === 0}
                className="px-4 py-2 rounded-lg text-sm font-medium"
                style={{ background: selected.size > 0 ? 'var(--accent)' : 'var(--border)', color: 'white', opacity: selected.size > 0 ? 1 : 0.5 }}
              >
                Add ({selected.size})
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
