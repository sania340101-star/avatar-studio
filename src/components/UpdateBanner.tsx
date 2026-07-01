'use client';

import { useState, useEffect, useRef } from 'react';

export default function UpdateBanner() {
  const initialVersion = useRef<string | null>(null);
  const [newVersion, setNewVersion] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    async function fetchVersion() {
      try {
        const res = await fetch(`/api/version?_t=${Date.now()}`);
        const data = await res.json();
        return data.version as string | undefined;
      } catch {
        return undefined;
      }
    }

    fetchVersion().then(v => {
      if (v) initialVersion.current = v;
    });

    const interval = setInterval(async () => {
      const v = await fetchVersion();
      if (v && initialVersion.current && v !== initialVersion.current) {
        setNewVersion(v);
      }
    }, 30_000);

    return () => clearInterval(interval);
  }, []);

  if (!newVersion || dismissed) return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        left: '50%',
        transform: 'translateX(-50%)',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '10px 16px',
        background: 'var(--bg-card)',
        border: '1px solid var(--accent)',
        borderRadius: 12,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3), 0 0 12px rgba(108,60,224,0.15)',
        zIndex: 2000,
        fontSize: 13,
        color: 'var(--text1)',
        animation: 'fadeIn 0.3s ease-out',
      }}
    >
      <span>Update available <strong>v{newVersion}</strong></span>
      <button
        onClick={() => location.reload()}
        style={{
          padding: '4px 14px',
          fontSize: 12,
          borderRadius: 6,
          background: 'var(--accent)',
          color: 'white',
          border: 'none',
          cursor: 'pointer',
          fontWeight: 600,
        }}
      >
        Update
      </button>
      <button
        onClick={() => setDismissed(true)}
        style={{
          background: 'none',
          border: 'none',
          color: 'var(--text3)',
          fontSize: 18,
          cursor: 'pointer',
          padding: '0 2px',
          lineHeight: 1,
        }}
      >
        &times;
      </button>
    </div>
  );
}
