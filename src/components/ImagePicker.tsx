'use client';

import { useState, useRef, useEffect } from 'react';
import { Generation } from '@/lib/types';
import { useProject } from '@/lib/ProjectContext';

interface Props {
  value: string;
  onChange: (url: string) => void;
  label?: string;
  refNumber?: number;
}

export default function ImagePicker({ value, onChange, label = 'Source Image', refNumber }: Props) {
  const { projects, activeProject } = useProject();
  const [showPicker, setShowPicker] = useState(false);
  const [projectImages, setProjectImages] = useState<Generation[]>([]);
  const [pickerProjectId, setPickerProjectId] = useState<string>('');
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (showPicker) {
      setPickerProjectId(activeProject?.id || 'all');
    }
  }, [showPicker, activeProject]);

  useEffect(() => {
    if (!showPicker) return;
    const params = new URLSearchParams({ type: 'image' });
    if (pickerProjectId && pickerProjectId !== 'all') params.set('projectId', pickerProjectId);
    fetch(`/api/generations?${params}`)
      .then(r => r.json())
      .then(data => { if (Array.isArray(data)) setProjectImages(data); });
  }, [showPicker, pickerProjectId]);

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError('');
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) {
        onChange(data.url);
        setShowPicker(false);
      } else if (data.error) {
        setUploadError(data.error);
      }
    } catch {
      setUploadError('Upload failed. Check file size and format.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  }

  const allImages = projectImages.flatMap(g => g.resultUrls);
  const projectMap = Object.fromEntries(projects.map(p => [p.id, p.title]));
  const pickerLabel = pickerProjectId === 'all'
    ? `All projects (${allImages.length})`
    : `${projectMap[pickerProjectId] || 'Project'} (${allImages.length})`;

  return (
    <div>
      <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>{label}</label>

      <div className="flex flex-wrap gap-2">
        {value && (
          <div className="relative w-20 h-20 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
            {refNumber != null && (
              <span className="absolute top-0 left-0 z-10 w-6 h-6 flex items-center justify-center rounded-br-lg text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{refNumber}</span>
            )}
            <img src={value} alt="" className="w-full h-full object-cover" />
            <button
              onClick={() => onChange('')}
              className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg"
              style={{ background: 'var(--red)', color: 'white' }}
            >
              x
            </button>
          </div>
        )}
        <button
          onClick={() => setShowPicker(true)}
          className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1"
          style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
        >
          <span className="text-2xl">+</span>
          <span>{value ? 'Change' : 'Add'}</span>
        </button>
      </div>

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
              {uploadError && <p className="text-xs mt-1" style={{ color: 'var(--red, #ef4444)' }}>{uploadError}</p>}
            </div>

            {projects.length > 1 && (
              <div className="mb-3">
                <select
                  value={pickerProjectId}
                  onChange={e => setPickerProjectId(e.target.value)}
                  className="w-full text-sm px-3 py-2 rounded-lg border"
                  style={{ borderColor: 'var(--border)', background: 'var(--bg-input)', color: 'var(--text1)' }}
                >
                  <option value="all">All Projects</option>
                  {projects.map(p => (
                    <option key={p.id} value={p.id}>{p.title}</option>
                  ))}
                </select>
              </div>
            )}

            {allImages.length > 0 && (
              <>
                <p className="text-sm mb-2" style={{ color: 'var(--text2)' }}>{pickerLabel}</p>
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
                No images yet. Generate some images first or upload from your computer.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
