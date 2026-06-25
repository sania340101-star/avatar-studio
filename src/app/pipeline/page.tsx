'use client';

import AppShell from '@/components/AppShell';

export default function PipelinePage() {
  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-6">Pipeline</h2>
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-4xl mb-3">⚡</div>
          <p className="font-medium mb-1">Coming Soon</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Batch generation pipeline — attach images, select templates, generate at scale.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
