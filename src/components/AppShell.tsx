'use client';

import { useEffect, useState } from 'react';
import { AppUser } from '@/lib/types';
import { tryAutoLogin } from '@/lib/auth';
import { ProjectProvider } from '@/lib/ProjectContext';
import Sidebar from './Sidebar';

export default function AppShell({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const u = tryAutoLogin();
    setUser(u);
    setLoading(false);
  }, []);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text3)' }}>Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
        <div className="text-center p-8 rounded-2xl max-w-sm" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <h1 className="text-xl font-semibold mb-2" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
          <p className="text-sm mb-6" style={{ color: 'var(--text2)' }}>
            Launch this app from Agent Factory to sign in automatically.
          </p>
          <div className="p-4 rounded-lg text-sm" style={{ background: 'var(--accent-subtle)', color: 'var(--text2)' }}>
            Go to <strong style={{ color: 'var(--accent)' }}>Apps</strong> tab in Agent Factory → click <strong style={{ color: 'var(--accent)' }}>Launch</strong>
          </div>
        </div>
      </div>
    );
  }

  return (
    <ProjectProvider>
      <div className="h-full flex">
        <Sidebar />
        <main className="flex-1 overflow-auto p-6">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </ProjectProvider>
  );
}
