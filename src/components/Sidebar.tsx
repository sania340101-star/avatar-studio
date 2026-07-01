'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect, useCallback } from 'react';
import { useProject } from '@/lib/ProjectContext';
import { AppUser } from '@/lib/types';

const GLOBAL_NAV = [
  {
    label: 'Templates',
    href: '/templates',
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
        <rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />
      </svg>
    ),
  },
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

interface SpendingData {
  spent: number;
  limit: number;
  remaining: number;
  falBalance: number | null;
}

export default function Sidebar({ open, onClose, user }: { open?: boolean; onClose?: () => void; user?: AppUser | null }) {
  const pathname = usePathname();
  const { projects, activeProject, setActiveProjectId, createProject, deleteProject } = useProject();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [spending, setSpending] = useState<SpendingData | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const fetchSpending = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch('/api/user/spending');
      if (res.ok) setSpending(await res.json());
    } catch { /* ignore */ }
  }, [user]);

  useEffect(() => {
    fetchSpending();
    const iv = setInterval(fetchSpending, 30_000);
    return () => clearInterval(iv);
  }, [fetchSpending]);

  const filteredProjects = projectSearch
    ? projects.filter(p => p.title.toLowerCase().includes(projectSearch.toLowerCase()))
    : projects;

  async function handleCreate() {
    if (!newTitle.trim()) return;
    await createProject(newTitle.trim());
    setNewTitle('');
    setCreating(false);
  }

  return (
    <>
      {/* Mobile backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onClose}
        />
      )}
      <aside className={`
        w-60 flex-shrink-0 h-full flex flex-col border-r
        fixed inset-y-0 left-0 z-40 transition-transform duration-200
        md:static md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>

      {/* Header */}
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>HYPERVSN</p>
      </div>

      {/* Projects section */}
      <div className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-2">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text1)' }}>Projects</h3>
            <button
              onClick={() => setCreating(true)}
              className="text-xs px-2.5 py-1 rounded-md font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              + New
            </button>
          </div>

          <input
            value={projectSearch}
            onChange={e => setProjectSearch(e.target.value)}
            placeholder="Search projects..."
            className="w-full text-xs !py-1.5 !px-2 mb-2"
          />

          {creating && (
            <div className="flex gap-1 mb-2">
              <input
                autoFocus
                value={newTitle}
                onChange={e => setNewTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setCreating(false); }}
                placeholder="Project name"
                className="flex-1 text-xs !py-1 !px-2"
              />
              <button onClick={handleCreate} className="text-xs px-2 py-1 rounded" style={{ background: 'var(--accent)', color: 'white' }}>+</button>
              <button onClick={() => setCreating(false)} className="text-xs px-1" style={{ color: 'var(--text3)' }}>×</button>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-auto px-2">
          {projects.length === 0 && !creating && (
            <button
              onClick={() => setCreating(true)}
              className="w-full py-6 rounded-lg border border-dashed text-xs text-center"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
            >
              Create your first project
            </button>
          )}

          <div className="space-y-0.5">
            {filteredProjects.map(p => {
              const isActive = p.id === activeProject?.id && pathname.startsWith('/generate');
              return (
                <div key={p.id}>
                  <div
                    className="flex items-center gap-1 group rounded-lg transition-colors"
                    style={{
                      background: isActive ? 'var(--accent-subtle)' : 'transparent',
                    }}
                  >
                    <Link
                      href="/generate"
                      onClick={() => { setActiveProjectId(p.id); onClose?.(); }}
                      className="flex-1 text-left text-sm px-3 py-2 flex items-center gap-2 min-w-0"
                      style={{ color: isActive ? 'var(--accent)' : 'var(--text2)' }}
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0" style={{ opacity: 0.5 }}>
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                      </svg>
                      <span className="truncate">{p.title}</span>
                    </Link>
                    <button
                      onClick={e => { e.stopPropagation(); setConfirmDelete(true); setActiveProjectId(p.id); }}
                      className="md:opacity-0 md:group-hover:opacity-100 transition-opacity px-2 py-2 flex-shrink-0"
                      style={{ color: 'var(--text3)' }}
                      title="Delete project"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                  </div>

                </div>
              );
            })}
          </div>
        </div>

        {/* Global nav */}
        <div className="px-2 py-2 border-t" style={{ borderColor: 'var(--border)' }}>
          <p className="text-[10px] font-semibold uppercase tracking-wider px-3 mb-1" style={{ color: 'var(--text3)' }}>Global</p>
          <div className="space-y-0.5">
            {GLOBAL_NAV.map(item => {
              const active = pathname.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={onClose}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors"
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
          </div>
        </div>
      </div>

      {confirmDelete && activeProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDelete(false)}>
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
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete project?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>
              &quot;{activeProject.title}&quot; and all its generations will be permanently deleted.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => { deleteProject(activeProject.id); setConfirmDelete(false); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spending */}
      {spending && (
        <div className="px-3 pt-2 pb-1 border-t" style={{ borderColor: 'var(--border)' }}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>Daily spend</span>
            <span className="text-xs" style={{ color: 'var(--text3)' }}>
              ${spending.spent.toFixed(2)} / ${spending.limit.toFixed(2)}
            </span>
          </div>
          <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div
              className="h-full rounded-full transition-all duration-300"
              style={{
                width: `${Math.min(100, (spending.spent / spending.limit) * 100)}%`,
                background: spending.spent >= spending.limit ? 'var(--red, #ef4444)' : spending.spent >= spending.limit * 0.8 ? '#f59e0b' : 'var(--accent)',
              }}
            />
          </div>
          {spending.falBalance !== null && (
            <div className="flex items-center justify-between mt-1.5">
              <span className="text-xs" style={{ color: 'var(--text3)' }}>fal.ai balance</span>
              <span className="text-xs font-medium" style={{ color: 'var(--text2)' }}>
                ${spending.falBalance.toFixed(2)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Footer */}
      <div className="px-3 py-2 border-t flex items-center justify-between text-xs" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
        {user && (
          <span className="truncate" title={user.email || user.userName || user.userId}>
            {user.email || user.userName || user.userId}
          </span>
        )}
        <span className="flex-shrink-0 ml-2">v{process.env.APP_VERSION || '?'}</span>
      </div>
    </aside>
    </>
  );
}
