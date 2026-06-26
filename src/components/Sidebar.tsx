'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState, useEffect } from 'react';
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

export default function Sidebar({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const pathname = usePathname();
  const { projects, activeProject, setActiveProjectId, createProject, deleteProject } = useProject();
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [projectSearch, setProjectSearch] = useState('');
  const [projectDropdownOpen, setProjectDropdownOpen] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    const stored = localStorage.getItem('avatar-studio-theme');
    if (stored === 'dark') setTheme('dark');
  }, []);

  function toggleTheme() {
    const next = theme === 'light' ? 'dark' : 'light';
    setTheme(next);
    localStorage.setItem('avatar-studio-theme', next);
    if (next === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

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
        w-56 flex-shrink-0 h-full flex flex-col border-r
        fixed inset-y-0 left-0 z-40 transition-transform duration-200
        md:static md:translate-x-0
        ${open ? 'translate-x-0' : '-translate-x-full'}
      `} style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
      <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
        <h1 className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
        <p className="text-xs mt-0.5" style={{ color: 'var(--text3)' }}>HYPERVSN</p>
      </div>

      <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
        <label className="block text-xs mb-1 font-medium" style={{ color: 'var(--text3)' }}>PROJECT</label>
        {projects.length > 0 ? (
          <div className="relative">
            <button
              onClick={() => setProjectDropdownOpen(!projectDropdownOpen)}
              className="w-full text-sm text-left px-2 py-1.5 rounded border flex items-center justify-between"
              style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
            >
              <span className="truncate">{activeProject?.title || 'Select...'}</span>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--text3)' }}>
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
            {projectDropdownOpen && (
              <div className="absolute left-0 right-0 top-full mt-1 z-20 rounded-lg border shadow-lg overflow-hidden" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                {projects.length > 5 && (
                  <div className="p-1.5">
                    <input
                      autoFocus
                      value={projectSearch}
                      onChange={e => setProjectSearch(e.target.value)}
                      placeholder="Search projects..."
                      className="w-full text-xs !py-1 !px-2"
                    />
                  </div>
                )}
                <div className="max-h-48 overflow-auto">
                  {filteredProjects.map(p => (
                    <button
                      key={p.id}
                      onClick={() => { setActiveProjectId(p.id); setProjectDropdownOpen(false); setProjectSearch(''); }}
                      className="w-full text-left text-xs px-3 py-2 hover:opacity-80 transition-opacity"
                      style={{
                        background: p.id === activeProject?.id ? 'var(--accent-subtle)' : 'transparent',
                        color: p.id === activeProject?.id ? 'var(--accent)' : 'var(--text2)',
                      }}
                    >
                      {p.title}
                    </button>
                  ))}
                  {filteredProjects.length === 0 && (
                    <p className="text-xs px-3 py-2" style={{ color: 'var(--text3)' }}>No projects found</p>
                  )}
                </div>
              </div>
            )}
          </div>
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
              onClick={onClose}
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

      <div className="p-3 border-t text-xs flex items-center justify-between" style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}>
        <span>v1.3.0</span>
        <button
          onClick={toggleTheme}
          className="p-1 rounded-md transition-colors hover:opacity-70"
          title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
          style={{ color: 'var(--text3)' }}
        >
          {theme === 'light' ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
            </svg>
          )}
        </button>
      </div>
    </aside>
    </>
  );
}
