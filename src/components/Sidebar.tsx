'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { useProject } from '@/lib/ProjectContext';

const NAV_ITEMS = [
  {
    label: 'Generate Image',
    href: '/generate/image',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
      </svg>
    ),
  },
  {
    label: 'Generate Video',
    href: '/generate/video',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <polygon points="5 3 19 12 5 21 5 3" />
      </svg>
    ),
  },
  {
    label: 'Templates',
    href: '/templates',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
  { type: 'separator' as const },
  {
    label: 'Gallery',
    href: '/gallery',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <path d="M4 4h16v16H4z" /><path d="M4 4l8 8" /><path d="M20 4l-8 8" />
      </svg>
    ),
  },
  {
    label: 'Settings',
    href: '/settings',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
      </svg>
    ),
  },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { projects, activeProject, setActiveProjectId, createProject, deleteProject } = useProject();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  async function handleCreate() {
    if (!newTitle.trim()) return;
    await createProject(newTitle.trim());
    setNewTitle('');
    setCreating(false);
  }

  return (
    <aside className="w-56 flex-shrink-0 h-full flex flex-col border-r" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>HYPERVSN</p>
      </div>

      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text3)' }}>PROJECT</label>
        {projects.length > 0 ? (
          <select
            value={activeProject?.id || ''}
            onChange={e => setActiveProjectId(e.target.value)}
            className="w-full text-sm !py-1.5 !px-2"
          >
            {projects.map(p => (
              <option key={p.id} value={p.id}>{p.title}</option>
            ))}
          </select>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text3)' }}>No projects yet</p>
        )}

        {creating ? (
          <div className="mt-2 flex gap-1">
            <input
              autoFocus
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
              placeholder="Project name"
              className="flex-1 text-xs !py-1 !px-2"
            />
            <button onClick={handleCreate} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--accent)', color: 'white' }}>+</button>
            <button onClick={() => setCreating(false)} className="text-xs px-1" style={{ color: 'var(--text3)' }}>x</button>
          </div>
        ) : (
          <button
            onClick={() => setCreating(true)}
            className="mt-2 w-full py-1.5 rounded-lg border border-dashed text-xs"
            style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
          >
            + New Project
          </button>
        )}
      </div>

      <nav className="flex-1 p-3 space-y-1 overflow-auto">
        {NAV_ITEMS.map((item, i) => {
          if ('type' in item && item.type === 'separator') {
            return <div key={i} className="my-3 border-t" style={{ borderColor: 'var(--border)' }} />;
          }
          if (!('href' in item)) return null;
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors"
              style={{
                background: active ? 'var(--accent-subtle)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text2)',
              }}
            >
              {item.icon}
              {item.label}
            </Link>
          );
        })}
      </nav>

      {activeProject && (
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <button
            onClick={() => {
              if (confirm(`Delete project "${activeProject.title}"?`)) {
                deleteProject(activeProject.id);
              }
            }}
            className="w-full py-1.5 rounded-lg text-xs"
            style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.08)' }}
          >
            Delete Project
          </button>
        </div>
      )}

      <div className="p-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
        v1.1.0
      </div>
    </aside>
  );
}
