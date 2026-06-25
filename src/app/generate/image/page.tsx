'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { IMAGE_MODEL_OPTIONS, IMAGE_MODEL_GROUPS, getImageModelFormat, imageSizeToAspectRatio } from '@/lib/models';
import { getSessionUser } from '@/lib/auth';
import { useProject } from '@/lib/ProjectContext';
import { Generation } from '@/lib/types';
import VersionHistory from '@/components/VersionHistory';

interface GeneratedImage {
  url: string;
  seed?: number;
}

export default function GenerateImagePage() {
  const user = getSessionUser();
  const { activeProject } = useProject();
  const [model, setModel] = useState(IMAGE_MODEL_OPTIONS[0].id);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('portrait_16_9');
  const [count, setCount] = useState(4);
  const [references, setReferences] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/generations?projectId=${activeProject.id}&type=image`);
    const data = await res.json();
    if (Array.isArray(data)) setHistory(data);
  }, [activeProject]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleGenerate() {
    if (!prompt.trim() || !activeProject) return;
    setGenerating(true);
    setError('');
    try {
      const format = getImageModelFormat(model);
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          model,
          prompt: prompt.trim(),
          size,
          format,
          aspectRatio: format === 'aspect_ratio' ? imageSizeToAspectRatio(size) : undefined,
          count,
          references,
          falKey: user?.falKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const images: GeneratedImage[] = data.images || [];
      setResults(prev => [...images, ...prev]);

      const modelOpt = IMAGE_MODEL_OPTIONS.find(m => m.id === model);
      await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          userId: user?.userId,
          type: 'image',
          modelId: model,
          modelLabel: modelOpt?.label || model,
          prompt: prompt.trim(),
          params: { size, count, format },
          referenceUrls: references,
          resultUrls: images.map(img => img.url),
          status: 'completed',
        }),
      });
      loadHistory();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) setReferences(prev => [...prev, data.url]);
    }
    e.target.value = '';
  }

  function handleSelectVersion(gen: Generation) {
    setModel(gen.modelId);
    setPrompt(gen.prompt);
    if (gen.params.size) setSize(gen.params.size as string);
    if (gen.params.count) setCount(gen.params.count as number);
    setReferences(gen.referenceUrls || []);
    setResults(gen.resultUrls.map(url => ({ url })));
  }

  async function handleDeleteVersion(genId: string) {
    if (!activeProject) return;
    await fetch(`/api/generations?projectId=${activeProject.id}&generationId=${genId}`, { method: 'DELETE' });
    loadHistory();
  }

  if (!activeProject) {
    return (
      <div className="text-center py-16">
        <p className="text-lg mb-2" style={{ color: 'var(--text2)' }}>No project selected</p>
        <p className="text-sm" style={{ color: 'var(--text3)' }}>Create a project in the sidebar to start generating.</p>
      </div>
    );
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Generate Image</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>Project: {activeProject.title}</p>

      <div className="space-y-5">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
          <select value={model} onChange={e => setModel(e.target.value)} className="w-full">
            {IMAGE_MODEL_GROUPS.map(group => (
              <optgroup key={group.id} label={group.label}>
                {group.modelIds.map(id => {
                  const opt = IMAGE_MODEL_OPTIONS.find(o => o.id === id);
                  return opt ? <option key={id} value={id}>{opt.label}</option> : null;
                })}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="A photorealistic full-body portrait of a young woman standing in a relaxed pose..."
            className="w-full h-28 resize-none"
          />
          <div className="text-xs mt-1 text-right" style={{ color: 'var(--text3)' }}>
            {prompt.length} chars
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Size</label>
            <select value={size} onChange={e => setSize(e.target.value)} className="w-full">
              <option value="square">Square (1:1)</option>
              <option value="portrait_4_3">Portrait 4:3</option>
              <option value="portrait_16_9">Portrait 16:9</option>
              <option value="landscape_4_3">Landscape 4:3</option>
              <option value="landscape_16_9">Landscape 16:9</option>
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Count</label>
            <select value={count} onChange={e => setCount(Number(e.target.value))} className="w-full">
              {[1, 2, 4, 6, 8, 10].map(n => (
                <option key={n} value={n}>{n} images</option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Reference Images</label>
          <div className="flex flex-wrap gap-2">
            {references.map((ref, i) => (
              <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <img src={ref} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => setReferences(prev => prev.filter((_, j) => j !== i))}
                  className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg"
                  style={{ background: 'var(--red)', color: 'white' }}
                >
                  x
                </button>
              </div>
            ))}
            <button
              onClick={() => fileRef.current?.click()}
              className="w-16 h-16 rounded-lg border-2 border-dashed flex items-center justify-center text-2xl"
              style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
            >
              +
            </button>
            <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm" style={{ color: 'var(--text3)' }}>
            ~${(0.03 * count).toFixed(2)} estimated
          </span>
          <button
            onClick={handleGenerate}
            disabled={generating || !prompt.trim()}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: generating ? 'var(--text3)' : 'var(--accent)' }}
          >
            {generating ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Generating...
              </span>
            ) : (
              `Generate ${count} image${count > 1 ? 's' : ''}`
            )}
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {error}
          </div>
        )}
      </div>

      {results.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Results ({results.length})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {results.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden border group relative" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                <img src={img.url} alt="" className="w-full aspect-[9/16] object-cover" />
                <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-end p-2 gap-1">
                  <a
                    href={img.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex-1 py-1.5 rounded text-xs text-center text-white font-medium"
                    style={{ background: 'var(--accent)' }}
                  >
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <VersionHistory generations={history} onSelect={handleSelectVersion} onDelete={handleDeleteVersion} />
    </div>
  );
}
