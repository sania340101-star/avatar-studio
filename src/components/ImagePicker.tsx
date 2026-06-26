'use client';

import { useState, useRef, useEffect } from 'react';
import { Generation } from '@/lib/types';
import { useProject } from '@/lib/ProjectContext';

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
}

export default function ImagePicker({ value, onChange, label = 'Source Image' }: Props) {
  const { activeProject } = useProject();
  const [showPicker, setShowPicker] = useState(false);
  const [projectImages, setProjectImages] = useState<Generation[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPicker && activeProject) {
      fetch(`/api/generations?projectId=${activeProject.id}&type=image`)
        .then(r => r.json())
        .then(data => { if (Array.isArray(data)) setProjectImages(data); });
    }
  }, [showPicker, activeProject]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        onChange(data.url);
        setShowPicker(false);
      }
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const allImages = projectImages.flatMap(g => g.resultUrls);

  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>

      {value ? (
        <div className="flex items-center gap-3">
          <div className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onChange('')}
              className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg"
              style={{ background: 'var(--red)', color: 'white' }}
            >
              x
            </button>
          </div>
          <button
            onClick={() => setShowPicker(true)}
            className="text-sm px-3 py-1.5 rounded-lg border"
            style={{ borderColor: 'var(--border)', color: 'var(--text2)' }}
          >
            Change
          </button>
        </div>
      ) : (
        <button
          onClick={() => setShowPicker(true)}
          className="w-full py-3 rounded-lg border-2 border-dashed text-sm"
          style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
        >
          Select image from project or upload
        </button>
      )}

      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
          <div className="w-full max-w-lg max-h-[80vh] overflow-auto rounded-2xl p-4 sm:p-5 mx-3 sm:mx-0" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select Image</h3>
              <button onClick={() => setShowPicker(false)} className="text-xl" style={{ color: 'var(--text3)' }}>x</button>
            </div>

            <div className="mb-4">
              <button
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
                className="w-full py-3 rounded-lg border-2 border-dashed text-sm"
                style={{ borderColor: 'var(--accent)', color: 'var(--accent)' }}
              >
                {uploading ? 'Uploading...' : 'Upload from computer'}
              </button>
              <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={handleUpload} />
            </div>

            {allImages.length > 0 && (
              <>
                <p className="text-sm mb-2" style={{ color: 'var(--text2)' }}>From this project ({allImages.length})</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {allImages.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => { onChange(url); setShowPicker(false); }}
                      className="aspect-square rounded-lg overflow-hidden border-2 hover:border-[var(--accent)] transition-colors"
                      style={{ borderColor: value === url ? 'var(--accent)' : 'var(--border)' }}
                    >
                      <img src={url} alt="" className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
              </>
            )}

            {allImages.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text3)' }}>
                No images in this project yet. Generate some images first or upload from your computer.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
