'use client';

import { useEffect } from 'react';

interface Props {
  url: string;
  type: 'image' | 'video' | 'audio';
  name?: string;
  onClose: () => void;
}

async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    window.open(url, '_blank');
  }
}

export default function MediaPreview({ url, type, name, onClose }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div className="absolute top-4 right-4 flex items-center gap-6 z-10">
        <button
          onClick={e => { e.stopPropagation(); downloadFile(url, name || `file.${type === 'video' ? 'mp4' : type === 'audio' ? 'mp3' : 'png'}`); }}
          className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Download"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
          </svg>
        </button>
        <button
          onClick={onClose}
          className="w-11 h-11 flex items-center justify-center rounded-full text-white/70 hover:text-white hover:bg-white/10 transition-colors"
          aria-label="Close"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-8 h-8" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      </div>

      {name && (
        <div className="absolute top-4 left-4 text-white/60 text-sm max-w-[50vw] truncate z-10">
          {name}
        </div>
      )}

      <div onClick={e => e.stopPropagation()} className="max-w-[90vw] max-h-[90vh]">
        {type === 'image' && (
          <img src={url} alt={name || ''} className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        )}
        {type === 'video' && (
          <video src={url} controls autoPlay className="max-w-full max-h-[90vh] object-contain rounded-lg" />
        )}
        {type === 'audio' && (
          <div className="rounded-2xl p-8 flex flex-col items-center gap-4 min-w-[300px]" style={{ background: 'rgba(255,255,255,0.1)' }}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-16 h-16 text-white/60">
              <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
            </svg>
            {name && <p className="text-white/80 text-sm text-center">{name}</p>}
            <audio src={url} controls autoPlay className="w-full min-w-[280px]" />
          </div>
        )}
      </div>
    </div>
  );
}
