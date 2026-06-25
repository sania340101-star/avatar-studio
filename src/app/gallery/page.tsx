'use client';

import AppShell from '@/components/AppShell';

export default function GalleryPage() {
  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-6">Gallery</h2>
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="text-4xl mb-3">🖼️</div>
          <p className="font-medium mb-1">Coming Soon</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>
            Browse and manage all generated images and videos.
          </p>
        </div>
      </div>
    </AppShell>
  );
}
