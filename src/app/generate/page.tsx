'use client';

import { useState, useEffect } from 'react';
import GenerateImagePage from './image/page';
import GenerateVideoPage from './video/page';

type Mode = 'image' | 'video';
const MODE_KEY = 'avatar-studio:generate-mode';

export default function GeneratePage() {
  const [mode, setMode] = useState<Mode>(() => {
    if (typeof window !== 'undefined') {
      return (localStorage.getItem(MODE_KEY) as Mode) || 'image';
    }
    return 'image';
  });

  useEffect(() => {
    localStorage.setItem(MODE_KEY, mode);
  }, [mode]);

  return (
    <div>
      <div className="flex gap-1 p-1 rounded-xl mb-4" style={{ background: 'var(--bg-input)' }}>
        {(['image', 'video'] as Mode[]).map(m => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className="flex-1 py-2.5 rounded-lg text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            style={{
              background: mode === m ? 'var(--accent)' : 'transparent',
              color: mode === m ? 'white' : 'var(--text3)',
            }}
          >
            {m === 'image' ? (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            )}
            {m === 'image' ? 'Image' : 'Video'}
          </button>
        ))}
      </div>

      {mode === 'image' ? <GenerateImagePage /> : <GenerateVideoPage />}
    </div>
  );
}
