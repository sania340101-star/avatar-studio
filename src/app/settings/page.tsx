'use client';

import { useState } from 'react';
import AppShell from '@/components/AppShell';
import { getSessionUser, setSessionUser, clearSession } from '@/lib/auth';

export default function SettingsPage() {
  const user = getSessionUser();
  const [falKey, setFalKey] = useState(user?.falKey || '');
  const [anthropicKey, setAnthropicKey] = useState(user?.anthropicKey || '');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!user) return;
    const updated = { ...user, falKey: falKey.trim() || undefined, anthropicKey: anthropicKey.trim() || undefined };
    setSessionUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/';
  }

  const isOtp = user?.authMethod === 'otp';

  return (
    <AppShell>
      <div>
        <h2 className="text-xl font-semibold mb-6">Settings</h2>
        <div className="space-y-4 max-w-xl">
          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-3">Account</h3>
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>User</span>
                <span>{user?.userName || 'Unknown'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>Auth</span>
                <span>{user?.authMethod === 'sso' ? 'Agent Factory SSO' : 'Email OTP'}</span>
              </div>
              <div className="flex justify-between">
                <span style={{ color: 'var(--text2)' }}>Role</span>
                <span>{user?.role || 'user'}</span>
              </div>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-1">API Keys</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
              {isOtp
                ? 'Enter your API keys to enable generation and AI agent features.'
                : 'Keys synced from Agent Factory. Override here if needed.'}
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>fal.ai API Key</label>
                <input
                  type="password"
                  value={falKey}
                  onChange={e => setFalKey(e.target.value)}
                  placeholder="Enter fal.ai API key..."
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Required for image and video generation</p>
              </div>

              <div>
                <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Anthropic API Key</label>
                <input
                  type="password"
                  value={anthropicKey}
                  onChange={e => setAnthropicKey(e.target.value)}
                  placeholder="Enter Anthropic API key..."
                  className="w-full"
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Required for AI prompt generation agent</p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={handleSave}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Save Keys
                </button>
                {saved && <span className="text-sm" style={{ color: 'var(--green)' }}>Saved</span>}
              </div>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-3">Session</h3>
            <button
              onClick={handleLogout}
              className="px-4 py-2 rounded-lg text-sm"
              style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.08)' }}
            >
              Sign Out
            </button>
          </div>
        </div>
      </div>
    </AppShell>
  );
}
