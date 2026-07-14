'use client';

import { useState } from 'react';
import MediaPreview from './MediaPreview';
import GalleryBrowser, { GalleryItem } from './GalleryBrowser';

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  refNumber?: number;
}

export default function ImagePicker({ value, onChange, label = 'Source Image', refNumber }: Props) {
  const [showBrowser, setShowBrowser] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  function handleSelect(items: GalleryItem[]) {
    if (items.length > 0) onChange(items[0].url);
  }

  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>

      <div className="flex flex-wrap gap-2">
        {value && (
          <div className="relative w-20 h-20 rounded-lg overflow-hidden border cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => setPreviewUrl(value)}>
            {refNumber != null && (
              <span className="absolute top-0 left-0 z-10 w-6 h-6 flex items-center justify-center rounded-br-lg text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{refNumber}</span>
            )}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              onClick={e => { e.stopPropagation(); onChange(''); }}
              className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full"
              style={{ background: 'var(--red)', color: 'white' }}
              aria-label="Remove image"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          </div>
        )}
        <button
          onClick={() => setShowBrowser(true)}
          className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1"
          style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
        >
          <span className="text-2xl">+</span>
          <span>{value ? 'Change' : 'Add'}</span>
        </button>
      </div>

      {previewUrl && (
        <MediaPreview url={previewUrl} type="image" onClose={() => setPreviewUrl(null)} />
      )}

      <GalleryBrowser
        open={showBrowser}
        onClose={() => setShowBrowser(false)}
        onSelect={handleSelect}
        accept="image"
        multiple={false}
      />
    </div>
  );
}
