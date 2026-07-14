'use client';

import { useRef, useState } from 'react';
import { TemplateRef } from '@/lib/types';
import MediaPreview from './MediaPreview';
import GalleryBrowser, { GalleryItem } from './GalleryBrowser';

interface Props {
  references: TemplateRef[];
  onChange: (refs: TemplateRef[]) => void;
  accept?: string;
  label?: string;
}

function getRefType(file: File): TemplateRef['type'] {
  if (file.type.startsWith('audio/')) return 'audio';
  if (file.type.startsWith('video/')) return 'video';
  return 'image';
}

function acceptToGalleryType(accept?: string): 'image' | 'video' | 'all' | null {
  if (accept === 'audio/*') return null;
  if (accept === 'video/*') return 'video';
  if (accept === 'image/*') return 'image';
  return 'all';
}

export default function ReferenceUpload({ references, onChange, accept, label = 'References' }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [preview, setPreview] = useState<TemplateRef | null>(null);
  const [showGallery, setShowGallery] = useState(false);

  const galleryType = acceptToGalleryType(accept);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setUploading(true);
    setError('');
    const newRefs: TemplateRef[] = [];
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await fetch('/api/upload', { method: 'POST', body: formData });
        const data = await res.json();
        if (data.url) {
          newRefs.push({ url: data.url, type: getRefType(file), name: file.name });
        } else if (data.error) {
          setError(data.error);
        }
      } catch {
        setError('Upload failed. Check file size and format.');
      }
    }
    onChange([...references, ...newRefs]);
    setUploading(false);
    e.target.value = '';
  }

  function handleGallerySelect(items: GalleryItem[]) {
    const newRefs: TemplateRef[] = items.map(item => ({
      url: item.url,
      type: item.type,
      name: item.name,
    }));
    onChange([...references, ...newRefs]);
  }

  function handleRemove(idx: number) {
    onChange(references.filter((_, i) => i !== idx));
  }

  const images = references.filter(r => r.type === 'image');
  const videos = references.filter(r => r.type === 'video');
  const audios = references.filter(r => r.type === 'audio');

  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>

      {references.length > 0 && (
        <div className="mb-2 space-y-2">
          {images.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {images.map((ref, i) => {
                const globalIdx = references.indexOf(ref);
                return (
                  <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => setPreview(ref)}>
                    <span className="absolute top-0 left-0 z-10 w-5 h-5 flex items-center justify-center rounded-br-lg text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{i + 1}</span>
                    <img src={ref.url} alt={ref.name} className="w-full h-full object-cover" />
                    <button
                      onClick={e => { e.stopPropagation(); handleRemove(globalIdx); }}
                      className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full"
                      style={{ background: 'var(--red)', color: 'white' }}
                      aria-label="Remove image"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-white px-1 truncate">{ref.name}</div>
                  </div>
                );
              })}
            </div>
          )}

          {videos.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {videos.map((ref, i) => {
                const globalIdx = references.indexOf(ref);
                return (
                  <div key={i} className="relative w-24 h-16 rounded-lg overflow-hidden border cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => setPreview(ref)}>
                    <video src={ref.url} className="w-full h-full object-cover pointer-events-none" preload="metadata" />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/30">
                      <svg viewBox="0 0 24 24" fill="white" className="w-6 h-6 opacity-80">
                        <polygon points="5 3 19 12 5 21 5 3" />
                      </svg>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemove(globalIdx); }}
                      className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full"
                      style={{ background: 'var(--red)', color: 'white' }}
                      aria-label="Remove video"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-white px-1 truncate">{ref.name}</div>
                  </div>
                );
              })}
            </div>
          )}

          {audios.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {audios.map((ref, i) => {
                const globalIdx = references.indexOf(ref);
                return (
                  <div key={i} className="relative w-24 h-16 rounded-lg overflow-hidden border cursor-pointer" style={{ borderColor: 'var(--border)', background: 'var(--bg-input)' }} onClick={() => setPreview(ref)}>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-7 h-7" style={{ color: 'var(--green)' }}>
                        <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                      </svg>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); handleRemove(globalIdx); }}
                      className="absolute -top-1 -right-1 w-8 h-8 flex items-center justify-center rounded-full"
                      style={{ background: 'var(--red)', color: 'white' }}
                      aria-label="Remove audio"
                    >
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4" aria-hidden="true">
                        <path d="M18 6L6 18M6 6l12 12" />
                      </svg>
                    </button>
                    <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-xs text-white px-1 truncate">{ref.name}</div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <div className="flex gap-2">
        {galleryType && (
          <button
            onClick={() => setShowGallery(true)}
            className="flex-1 py-2.5 rounded-lg border text-sm font-medium"
            style={{ borderColor: 'var(--accent)', color: 'var(--accent)', background: 'var(--accent-subtle)' }}
          >
            Browse Gallery
          </button>
        )}
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className={`${galleryType ? 'flex-1' : 'w-full'} py-2.5 rounded-lg border-2 border-dashed text-sm`}
          style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
        >
          {uploading ? 'Uploading...' : accept === 'video/*' ? '+ Upload video' : accept === 'audio/*' ? '+ Add audio' : accept === 'image/*' ? '+ Upload images' : '+ Upload file'}
        </button>
      </div>
      <input
        ref={fileRef}
        type="file"
        accept={accept || 'image/*,video/*,audio/*'}
        multiple
        className="hidden"
        onChange={handleUpload}
      />

      {error && (
        <p className="text-xs mt-1" style={{ color: 'var(--red, #ef4444)' }}>{error}</p>
      )}

      {references.length > 0 && (
        <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
          {images.length > 0 && `${images.length} image${images.length > 1 ? 's' : ''}`}
          {videos.length > 0 && `${images.length > 0 ? ', ' : ''}${videos.length} video${videos.length > 1 ? 's' : ''}`}
          {audios.length > 0 && `${(images.length > 0 || videos.length > 0) ? ', ' : ''}${audios.length} audio`}
          {images.length > 1 && ' — reference by number: "image 1", "image 2", etc.'}
        </p>
      )}

      {preview && (
        <MediaPreview url={preview.url} type={preview.type} name={preview.name} onClose={() => setPreview(null)} />
      )}

      {galleryType && (
        <GalleryBrowser
          open={showGallery}
          onClose={() => setShowGallery(false)}
          onSelect={handleGallerySelect}
          accept={galleryType}
        />
      )}
    </div>
  );
}
