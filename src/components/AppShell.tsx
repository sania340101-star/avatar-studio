'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
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
  const [cooldown, setCooldown] = useState(0);
  const cooldownRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const codeInputRef = useRef<HTMLInputElement>(null);
  const verifyingRef = useRef(false);

  const startCooldown = useCallback(() => {
    setCooldown(60);
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    cooldownRef.current = setInterval(() => {
      setCooldown(prev => {
        if (prev <= 1) {
          if (cooldownRef.current) clearInterval(cooldownRef.current);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  }, []);

  useEffect(() => {
    return () => { if (cooldownRef.current) clearInterval(cooldownRef.current); };
  }, []);

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
      if (!res.ok) {
        setError(data.error || 'Failed to send code');
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      if (data.devCode) setDevCode(data.devCode);
      setStep('code');
      startCooldown();
      setTimeout(() => codeInputRef.current?.focus(), 50);
    } catch {
      setError('Failed to send code');
    } finally {
      setLoading(false);
    }
  }

  const handleVerify = useCallback(async (codeValue?: string) => {
    const c = codeValue ?? code;
    if (c.length !== 6 || verifyingRef.current) return;
    verifyingRef.current = true;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/auth/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code: c }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        const msg = data.error || 'Invalid code';
        const attemptsLeft = data.attemptsLeft;
        setError(attemptsLeft !== undefined ? `${msg} (${attemptsLeft} attempts left)` : msg);
        return;
      }
      const user: AppUser = {
        userId: data.userId,
        userName: data.userName,
        role: data.role,
        authMethod: 'otp',
        falKey: data.falKey,
        anthropicKey: data.anthropicKey,
      };
      setSessionUser(user);
      onLogin(user);
    } catch {
      setError('Verification failed');
    } finally {
      setLoading(false);
      verifyingRef.current = false;
    }
  }, [code, email, onLogin]);

  function handleCodeChange(value: string) {
    const digits = value.replace(/\D/g, '');
    setCode(digits);
    if (digits.length === 6) {
      handleVerify(digits);
    }
  }

  function handleResend() {
    setCode('');
    setError('');
    handleSendCode();
  }

  function handleBack() {
    setStep('email');
    setCode('');
    setError('');
    setDevCode('');
    if (cooldownRef.current) clearInterval(cooldownRef.current);
    setCooldown(0);
  }

  return (
    <div className="h-full flex items-center justify-center" style={{ background: 'var(--bg)' }}>
      <div className="w-full max-w-sm p-8 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <h1 className="text-xl font-semibold mb-1" style={{ color: 'var(--accent)' }}>Avatar Studio</h1>
        <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>HYPERVSN</p>

        <div className="min-h-[18px] mb-3">
          {error && (
            <p className="text-sm" style={{ color: 'var(--red, #ef4444)' }}>{error}</p>
          )}
        </div>

        {step === 'email' ? (
          <>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Email</label>
            <input
              type="email"
              value={email}
              onChange={e => { setEmail(e.target.value); setError(''); }}
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
              {loading ? 'Sending...' : 'Get Code'}
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
            <input
              ref={codeInputRef}
              type="text"
              inputMode="numeric"
              maxLength={6}
              value={code}
              onChange={e => { handleCodeChange(e.target.value); setError(''); }}
              onKeyDown={e => e.key === 'Enter' && handleVerify()}
              placeholder="000000"
              className="w-full mb-4 text-center font-bold"
              style={{ fontSize: '24px', letterSpacing: '8px' }}
              autoFocus
            />
            {loading && (
              <div className="flex items-center justify-center gap-2 mb-4 py-2">
                <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                <span className="text-sm" style={{ color: 'var(--text3)' }}>Verifying...</span>
              </div>
            )}
            <button
              onClick={handleResend}
              disabled={loading || cooldown > 0}
              className="w-full py-2.5 rounded-lg text-sm font-semibold disabled:opacity-50"
              style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}
            >
              {cooldown > 0 ? `Resend (${cooldown}s)` : 'Resend Code'}
            </button>
            <button
              onClick={handleBack}
              className="w-full mt-2 py-2 text-sm"
              style={{ color: 'var(--text3)' }}
            >
              ← Back
            </button>
          </>
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
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
      <div className="h-full flex flex-col md:flex-row">
        {/* Mobile header bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
          <button
            onClick={() => setSidebarOpen(true)}
            className="w-10 h-10 flex items-center justify-center rounded-lg"
            style={{ color: 'var(--text1)' }}
            aria-label="Open menu"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-6 h-6">
              <path d="M3 12h18M3 6h18M3 18h18" />
            </svg>
          </button>
          <span className="text-lg font-semibold" style={{ color: 'var(--accent)' }}>Avatar Studio</span>
        </div>
        <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-[env(safe-area-inset-bottom,0px)]">
          <div className="max-w-5xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </ProjectProvider>
  );
}
