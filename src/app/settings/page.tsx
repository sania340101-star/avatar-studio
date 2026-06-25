'use client';

import AppShell from '@/components/AppShell';
import { getSessionUser } from '@/lib/auth';

export default function SettingsPage() {
  const user = getSessionUser();

  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-6">Settings</h2>
        <div className="space-y-4">
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-3">Account</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>User</span>
                <span>{user?.userName || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>Role</span>
                <span>{user?.role || 'user'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>fal.ai Key</span>
                <span>{user?.falKey ? '••••' + user.falKey.slice(-4) : 'Not configured'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-3">Theme</h3>
            <p className="text-sm" style={{ color: 'var(--text3)' }}>
              Theme switching coming in a future update.
            </p>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
