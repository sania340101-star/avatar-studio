'use client';

import { useState } from 'react';
import { VIDEO_MODELS, MODEL_GROUPS } from '@/lib/models';
import { getSessionUser } from '@/lib/auth';

export default function GenerateVideoPage() {
  const user = getSessionUser();
  const [model, setModel] = useState(VIDEO_MODELS[0].id);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [sourceImage, setSourceImage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ url: string }[]>([]);
  const [error, setError] = useState('');

  const selectedModel = VIDEO_MODELS.find(m => m.id === model);

  async function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          model,
          prompt: prompt.trim(),
          duration,
          sourceImage: sourceImage || undefined,
          falKey: user?.falKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.video) setResults(prev => [data.video, ...prev]);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-6">Generate Video</h2>

      <div className="space-y-5">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
          <select value={model} onChange={e => { setModel(e.target.value); const m = VIDEO_MODELS.find(v => v.id === e.target.value); if (m) setDuration(m.defaultDuration); }} className="w-full">
            {MODEL_GROUPS.video.map(group => (
              <optgroup key={group} label={group}>
                {VIDEO_MODELS.filter(m => m.group === group).map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt</label>
          <textarea
            value={prompt}
            onChange={e => setPrompt(e.target.value)}
            placeholder="Animate the character with natural idle movement, subtle breathing..."
            className="w-full h-28 resize-none"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full">
              {(selectedModel?.durations || [5]).map(d => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Source Image URL</label>
            <input
              type="text"
              value={sourceImage}
              onChange={e => setSourceImage(e.target.value)}
              placeholder="https://... or leave empty"
              className="w-full"
            />
          </div>
        </div>

        <div className="flex items-center justify-between pt-2">
          <span className="text-sm" style={{ color: 'var(--text3)' }}>
            ~$0.10 estimated
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
            ) : 'Generate Video'}
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
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {results.map((vid, i) => (
              <div key={i} className="rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                <video src={vid.url} controls className="w-full" />
                <div className="p-2 flex gap-2">
                  <a href={vid.url} target="_blank" rel="noopener noreferrer"
                    className="flex-1 py-1.5 rounded text-xs text-center text-white font-medium"
                    style={{ background: 'var(--accent)' }}>
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
