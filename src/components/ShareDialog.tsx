'use client';

import { useState, useEffect } from 'react';
import { RegisteredUser } from '@/lib/types';

interface ShareDialogProps {
  entityType: 'project' | 'template' | 'export' | 'generation';
  entityId: string;
  entityName: string;
  projectId?: string;
  onClose: () => void;
}

export default function ShareDialog({ entityType, entityId, entityName, projectId, onClose }: ShareDialogProps) {
  const [users, setUsers] = useState<RegisteredUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  useEffect(() => {
    fetch('/api/users')
      .then(r => r.json())
      .then(data => { setUsers(Array.isArray(data) ? data : []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleShare(targetUserId: string, targetName: string) {
    setSharing(true);
    setResult(null);
    try {
      const res = await fetch('/api/share', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entityType, entityId, targetUserId, ...(projectId ? { projectId } : {}) }),
      });
      const data = await res.json();
      if (res.ok && data.ok) {
        setResult({ ok: true, message: `Shared to ${targetName}` });
      } else {
        setResult({ ok: false, message: data.error || 'Share failed' });
      }
    } catch {
      setResult({ ok: false, message: 'Network error' });
    } finally {
      setSharing(false);
    }
  }

  const filtered = search
    ? users.filter(u =>
      (u.userName || '').toLowerCase().includes(search.toLowerCase()) ||
      (u.email || '').toLowerCase().includes(search.toLowerCase()))
    : users;

  const typeLabel = entityType === 'project' ? 'Project' : entityType === 'template' ? 'Template' : entityType === 'generation' ? 'Generation' : 'Export';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative rounded-xl p-5 w-96 max-w-[90vw] shadow-xl max-h-[80vh] flex flex-col"
        style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}
        onClick={e => e.stopPropagation()}
      >
        <h3 className="text-sm font-semibold mb-0.5" style={{ color: 'var(--text1)' }}>
          Share {typeLabel}
        </h3>
        <p className="text-xs mb-3 truncate" style={{ color: 'var(--text3)' }}>{entityName}</p>

        {result ? (
          <div className="text-center py-6">
            <div className="text-2xl mb-2">{result.ok ? '✓' : '✗'}</div>
            <p className="text-sm mb-4" style={{ color: result.ok ? 'var(--accent)' : 'var(--red, #ef4444)' }}>
              {result.message}
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-sm font-medium"
              style={{ background: 'var(--accent)', color: 'white' }}
            >
              Done
            </button>
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search users..."
              className="w-full text-sm !py-2 !px-3 mb-2"
              autoFocus
            />

            <div className="flex-1 overflow-auto min-h-0" style={{ maxHeight: '300px' }}>
              {loading ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>Loading users...</p>
              ) : filtered.length === 0 ? (
                <p className="text-xs text-center py-4" style={{ color: 'var(--text3)' }}>
                  {users.length === 0 ? 'No other users registered yet' : 'No users match your search'}
                </p>
              ) : (
                <div className="space-y-1">
                  {filtered.map(u => (
                    <button
                      key={u.userId}
                      onClick={() => handleShare(u.userId, u.userName || u.email || u.userId)}
                      disabled={sharing}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors hover:opacity-80"
                      style={{ background: 'var(--bg-main)' }}
                    >
                      <div
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0"
                        style={{ background: 'var(--accent)', color: 'white' }}
                      >
                        {(u.userName || u.email || '?')[0].toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium truncate" style={{ color: 'var(--text1)' }}>
                          {u.userName || u.userId}
                        </p>
                        {u.email && (
                          <p className="text-xs truncate" style={{ color: 'var(--text3)' }}>{u.email}</p>
                        )}
                      </div>
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 flex-shrink-0" style={{ color: 'var(--text3)' }}>
                        <path d="M4 12h16M12 4l8 8-8 8" />
                      </svg>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={onClose}
              className="mt-3 w-full py-2 rounded-lg text-sm font-medium"
              style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}
            >
              Cancel
            </button>
          </>
        )}
      </div>
    </div>
  );
}
