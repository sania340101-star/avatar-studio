'use client';

import { useState, useEffect } from 'react';
import AppShell from '@/components/AppShell';
import { getSessionUser, setSessionUser, clearSession } from '@/lib/auth';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';

export default function SettingsPage() {
  const user = getSessionUser();
  const [systemPrompt, setSystemPrompt] = useState(user?.systemPrompt || DEFAULT_SYSTEM_PROMPT);
  const [saved, setSaved] = useState(false);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [falKeyInput, setFalKeyInput] = useState('');
  const [anthropicKeyInput, setAnthropicKeyInput] = useState('');
  const [keySaving, setKeySaving] = useState(false);
  const [keySaved, setKeySaved] = useState(false);
  const isOtp = user?.authMethod !== 'sso';

  useEffect(() => {
    const stored = localStorage.getItem('avatar-studio-theme');
    if (stored === 'dark') setTheme('dark');
  }, []);

  function handleThemeChange(t: 'light' | 'dark') {
    setTheme(t);
    localStorage.setItem('avatar-studio-theme', t);
    if (t === 'dark') {
      document.documentElement.setAttribute('data-theme', 'dark');
    } else {
      document.documentElement.removeAttribute('data-theme');
    }
  }

  function handleSave() {
    if (!user) return;
    const updated = { ...user, systemPrompt: systemPrompt.trim() || undefined };
    setSessionUser(updated);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function handleLogout() {
    clearSession();
    window.location.href = '/';
  }

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
            <h3 className="font-medium mb-3">Theme</h3>
            <div className="flex gap-2">
              <button
                onClick={() => handleThemeChange('light')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: theme === 'light' ? 'var(--accent)' : 'var(--bg-input)',
                  color: theme === 'light' ? '#fff' : 'var(--text2)',
                  border: `1px solid ${theme === 'light' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
                Light
              </button>
              <button
                onClick={() => handleThemeChange('dark')}
                className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
                style={{
                  background: theme === 'dark' ? 'var(--accent)' : 'var(--bg-input)',
                  color: theme === 'dark' ? '#fff' : 'var(--text2)',
                  border: `1px solid ${theme === 'dark' ? 'var(--accent)' : 'var(--border)'}`,
                }}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
                Dark
              </button>
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-1">API Keys</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
              {isOtp ? 'Enter your API keys to enable generation.' : 'Keys are provided via Agent Factory SSO.'}
            </p>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text2)' }}>fal.ai</span>
                {user?.hasFalKey ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(76,175,80,0.1)', color: 'var(--green)' }}>Configured</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>Not configured</span>
                )}
              </div>
              {isOtp && (
                <input
                  type="password"
                  value={falKeyInput}
                  onChange={e => setFalKeyInput(e.target.value)}
                  placeholder={user?.hasFalKey ? '••••••••  (enter new key to replace)' : 'Enter fal.ai API key'}
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              )}
              <div className="flex justify-between items-center">
                <span style={{ color: 'var(--text2)' }}>Anthropic (Claude)</span>
                {user?.hasAnthropicKey ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(76,175,80,0.1)', color: 'var(--green)' }}>Configured</span>
                ) : !isOtp ? (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(76,175,80,0.05)', color: 'var(--text3)' }}>Via agent</span>
                ) : (
                  <span className="px-2 py-0.5 rounded text-xs font-medium" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>Not configured</span>
                )}
              </div>
              {isOtp && (
                <input
                  type="password"
                  value={anthropicKeyInput}
                  onChange={e => setAnthropicKeyInput(e.target.value)}
                  placeholder={user?.hasAnthropicKey ? '••••••••  (enter new key to replace)' : 'Enter Anthropic API key'}
                  className="w-full text-sm px-3 py-2 rounded-lg"
                  style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text)' }}
                />
              )}
              {isOtp && (falKeyInput || anthropicKeyInput) && (
                <button
                  onClick={async () => {
                    setKeySaving(true);
                    try {
                      const body: Record<string, string> = {};
                      if (falKeyInput) body.falKey = falKeyInput;
                      if (anthropicKeyInput) body.anthropicKey = anthropicKeyInput;
                      const res = await fetch('/api/auth/keys', {
                        method: 'PATCH',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(body),
                      });
                      if (res.ok) {
                        const data = await res.json();
                        if (user) {
                          setSessionUser({ ...user, hasFalKey: data.hasFalKey, hasAnthropicKey: data.hasAnthropicKey });
                        }
                        setFalKeyInput('');
                        setAnthropicKeyInput('');
                        setKeySaved(true);
                        setTimeout(() => setKeySaved(false), 2000);
                      }
                    } finally {
                      setKeySaving(false);
                    }
                  }}
                  disabled={keySaving}
                  className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  {keySaving ? 'Saving...' : 'Save Keys'}
                </button>
              )}
              {keySaved && <span className="text-sm" style={{ color: 'var(--green)' }}>Keys saved</span>}
            </div>
          </div>

          <div className="rounded-xl p-5" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <h3 className="font-medium mb-1">System Prompt</h3>
            <p className="text-xs mb-4" style={{ color: 'var(--text3)' }}>
              Instructions injected into every generation. Defines visual style, display requirements, and quality rules for the AI agent.
            </p>
            <label htmlFor="input-system-prompt" className="sr-only">System Prompt</label>
            <textarea
              id="input-system-prompt"
              value={systemPrompt}
              onChange={e => setSystemPrompt(e.target.value)}
              className="w-full h-48 resize-y text-sm"
              placeholder="Enter system prompt for generation agent..."
            />
            <div className="flex items-center gap-3 mt-3">
              <button
                onClick={() => setSystemPrompt(DEFAULT_SYSTEM_PROMPT)}
                className="px-4 py-2 rounded-lg text-sm"
                style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
              >
                Reset to Default
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 rounded-lg text-sm font-semibold text-white"
                style={{ background: 'var(--accent)' }}
              >
                Save
              </button>
              {saved && <span className="text-sm" style={{ color: 'var(--green)' }}>Saved</span>}
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
