'use client';

import { useEffect, useState } from 'react';
import { AppUser } from '@/lib/types';
import { tryAutoLogin, setSessionUser } from '@/lib/auth';
import { ProjectProvider } from '@/lib/ProjectContext';
import Sidebar from './Sidebar';

function OtpLogin({ onLogin }: { onLogin: (user: AppUser) => void }) {
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [devCode, setDevCode] = useState('');

  async function handleSendCode() {
    if (!email.includes('@')) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      if (data.devCode) setDevCode(data.devCode);
      setStep('code');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  async function handleVerify() {
    if (code.length !== 6) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      const user: AppUser = {
        userId: data.userId,
        userName: data.userName,
        role: data.role,
        authMethod: 'otp',
        falKey: data.falKey,
      };
      setSessionUser(user);
      onLogin(user);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Invalid code');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>HYPERVSN</p>

        {step === 'email' ? (
          <>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSendCode()}
              placeholder="you@company.com"
              className="w-full mb-4"
              autoFocus
            />
            <button
              onClick={handleSendCode}
              disabled={loading || !email.includes('@')}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Sending...' : 'Send Login Code'}
            </button>
          </>
        ) : (
          <>
            <p className="text-sm mb-4" style={{ color: 'var(--text2)' }}>
              {devCode ? 'Email delivery not configured.' : 'Code sent to'}{' '}
              <strong style={{ color: 'var(--text1)' }}>{email}</strong>
            </p>
            {devCode && (
              <div className="mb-4 p-3 rounded-lg text-center" style={{ background: 'var(--accent-subtle)', border: '1px solid var(--accent)' }}>
                <p className="text-xs mb-1" style={{ color: 'var(--text3)' }}>Your login code:</p>
                <p className="text-2xl font-semibold tracking-[0.3em]" style={{ color: 'var(--accent)' }}>{devCode}</p>
              </div>
            )}
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>6-digit code</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="000000"
              className="w-full mb-4 text-center text-2xl tracking-[0.3em]"
              autoFocus
            />
            <button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              className="w-full py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </button>
            <button
              onClick={() => { setStep('email'); setCode(''); setError(''); }}
              className="w-full mt-2 py-2 text-sm"
              style={{ color: 'var(--text3)' }}
            >
              Use different email
            </button>
          </>
        )}

        {error && (
          <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)' }}>
            {error}
          </div>
        )}

        <div className="mt-6 pt-4 border-t text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs" style={{ color: 'var(--text3)' }}>
            Or launch from <strong style={{ color: 'var(--accent)' }}>Agent Factory</strong> for auto sign-in
          </p>
        </div>
      </div>
    </div>
  );
}

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
    return <OtpLogin onLogin={setUser} />;
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
