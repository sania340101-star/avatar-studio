'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import AppShell from '@/components/AppShell';
import { ExportSession } from '@/lib/types';

function ExportListContent() {
  const router = useRouter();
  const [sessions, setSessions] = useState<ExportSession[]>([]);
  const [creating, setCreating] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/exports');
    if (res.ok) setSessions(await res.json());
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleCreate() {
    setCreating(true);
    const res = await fetch('/api/exports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Export ${new Date().toLocaleDateString()}` }),
    });
    if (res.ok) {
      const session = await res.json();
      router.push(`/export/${session.id}`);
    }
    setCreating(false);
  }

  async function handleDelete(id: string) {
    await fetch(`/api/exports?id=${id}`, { method: 'DELETE' });
    setConfirmDeleteId(null);
    load();
  }

  const statusColors: Record<string, { bg: string; color: string }> = {
    draft: { bg: 'rgba(59,130,246,0.12)', color: 'var(--blue, #3b82f6)' },
    exporting: { bg: 'rgba(245,158,11,0.12)', color: '#f59e0b' },
    done: { bg: 'rgba(76,175,80,0.12)', color: 'var(--green, #22c55e)' },
    error: { bg: 'rgba(239,68,68,0.12)', color: 'var(--red, #ef4444)' },
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">Export</h2>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>Build playlists and export for HYPERVSN devices</p>
        </div>
        <button
          onClick={handleCreate}
          disabled={creating}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
          style={{ background: 'var(--accent)' }}
        >
          + New Export
        </button>
      </div>

      {sessions.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3" style={{ background: 'var(--accent-subtle)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6" style={{ color: 'var(--accent)' }}>
              <rect x="2" y="3" width="20" height="14" rx="2" /><polygon points="10 8 16 11 10 14 10 8" />
            </svg>
          </div>
          <p className="font-medium mb-1" style={{ color: 'var(--text2)' }}>No export sessions yet</p>
          <p className="text-sm mb-4" style={{ color: 'var(--text3)' }}>
            Create a new export or select videos in Gallery to get started.
          </p>
          <button
            onClick={handleCreate}
            disabled={creating}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            + New Export
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {sessions.map(session => {
            const sc = statusColors[session.status] || statusColors.draft;
            return (
              <div
                key={session.id}
                className="rounded-xl border p-4 cursor-pointer hover:border-[var(--accent)] transition-colors"
                style={{ background: 'var(--bg-card)', borderColor: 'var(--border)' }}
                onClick={() => router.push(`/export/${session.id}`)}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: 'var(--accent-subtle)' }}>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5" style={{ color: 'var(--accent)' }}>
                        <rect x="2" y="3" width="20" height="14" rx="2" /><polygon points="10 8 16 11 10 14 10 8" />
                      </svg>
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <span className="text-sm font-medium truncate" style={{ color: 'var(--text1)' }}>{session.name}</span>
                        <span className="text-xs font-medium px-2 py-0.5 rounded flex-shrink-0" style={{ background: sc.bg, color: sc.color }}>
                          {session.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--text3)' }}>
                        <span>{session.clips.length} clip{session.clips.length !== 1 ? 's' : ''}</span>
                        <span>{session.device === 'hh1x3' ? 'HH 1x3' : 'Solo'}</span>
                        <span>{new Date(session.updatedAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(session.id); }}
                    className="text-xs px-2 py-1 rounded opacity-50 hover:opacity-100 flex-shrink-0"
                    style={{ color: 'var(--red)' }}
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {confirmDeleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setConfirmDeleteId(null)}>
          <div className="absolute inset-0 bg-black/50" />
          <div
            className="relative rounded-xl p-5 w-80 shadow-xl"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
            onClick={e => e.stopPropagation()}
          >
            <h3 className="text-sm font-semibold text-center mb-1" style={{ color: 'var(--text1)' }}>Delete export session?</h3>
            <p className="text-xs text-center mb-4" style={{ color: 'var(--text3)' }}>This cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDeleteId(null)}
                className="flex-1 py-2 rounded-lg text-sm font-medium"
                style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
              >
                Cancel
              </button>
              <button
                onClick={() => handleDelete(confirmDeleteId)}
                className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                style={{ background: 'var(--red, #ef4444)' }}
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ExportPage() {
  return <AppShell><ExportListContent /></AppShell>;
}
