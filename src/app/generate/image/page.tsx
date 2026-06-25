'use client';

import { useState, useRef } from 'react';
import { IMAGE_MODELS, MODEL_GROUPS } from '@/lib/models';
import { getSessionUser } from '@/lib/auth';

interface GeneratedImage {
  url: string;
  seed?: number;
}

export default function GenerateImagePage() {
  const user = getSessionUser();
  const [model, setModel] = useState(IMAGE_MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [size, setSize] = useState('portrait_16_9');
  const [count, setCount] = useState(4);
  const [references, setReferences] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const selectedModel = IMAGE_MODELS.find(m => m.id === model);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          model,
          prompt: prompt.trim(),
          size,
          count,
          references,
          falKey: user?.falKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResults(prev => [...(data.images || []), ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setReferences(prev => [...prev, reader.result as string]);
        }
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Generate Image</h2>

      <div className="space-y-5">
        {/* Model Selector */}
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
          <select
            value={model}
            onChange={e => setModel(e.target.value)}
            className="w-full"
          >
            {MODEL_GROUPS.image.map(group => (
              <optgroup key={group} label={group}>
                {IMAGE_MODELS.filter(m => m.group === group).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        {/* Prompt */}
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

        {/* Parameters */}
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

        {/* References */}
        {selectedModel?.supportsReferences && (
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
                    ×
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
        )}

        {/* Generate Button */}
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

      {/* Results */}
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
    </div>
  );
}
