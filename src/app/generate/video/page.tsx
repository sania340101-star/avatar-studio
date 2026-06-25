'use client';

import { useState } from 'react';
import {
  VIDEO_MODEL_OPTIONS,
  VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS,
  filterVideoModelsByType,
  getVideoModelType,
} from '@/lib/models';
import { getSessionUser } from '@/lib/auth';
import { VideoModelTypeFilter } from '@/lib/types';

export default function GenerateVideoPage() {
  const user = getSessionUser();
  const [typeFilter, setTypeFilter] = useState<VideoModelTypeFilter>('all');
  const [model, setModel] = useState(VIDEO_MODEL_OPTIONS[0].id);
  const [prompt, setPrompt] = useState('');
  const [duration, setDuration] = useState(5);
  const [sourceImage, setSourceImage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ url: string }[]>([]);
  const [error, setError] = useState('');

  const filteredModels = filterVideoModelsByType(typeFilter);
  const selectedModel = VIDEO_MODEL_OPTIONS.find(m => m.id === model);
  const selectedType = selectedModel ? getVideoModelType(selectedModel) : 'image-to-video';

  const avatarModels = filteredModels.filter(m => m.avatarAudio || m.avatarText || m.avatarVideoAudio);
  const utilityModels = filteredModels.filter(m => m.utilityVideo);
  const generalModels = filteredModels.filter(m => !m.avatarAudio && !m.avatarText && !m.avatarVideoAudio && !m.utilityVideo);

  const generalByGroup: Record<string, typeof generalModels> = {};
  for (const m of generalModels) {
    const group = VIDEO_MODEL_GROUPS.find(g => g.modelIds.includes(m.id));
    const key = group?.label ?? 'Other';
    if (!generalByGroup[key]) generalByGroup[key] = [];
    generalByGroup[key].push(m);
  }

  function handleTypeFilterChange(newFilter: VideoModelTypeFilter) {
    setTypeFilter(newFilter);
    const available = filterVideoModelsByType(newFilter);
    if (available.length > 0 && !available.find(m => m.id === model)) {
      setModel(available[0].id);
    }
  }

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Type Filter</label>
            <select
              value={typeFilter}
              onChange={e => handleTypeFilterChange(e.target.value as VideoModelTypeFilter)}
              className="w-full"
            >
              {VIDEO_MODEL_TYPE_FILTERS.map(f => (
                <option key={f.id} value={f.id}>{f.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>
              Model <span className="text-xs" style={{ color: 'var(--text3)' }}>({filteredModels.length})</span>
            </label>
            <select value={model} onChange={e => setModel(e.target.value)} className="w-full">
              {Object.entries(generalByGroup).map(([groupLabel, models]) => (
                <optgroup key={groupLabel} label={groupLabel}>
                  {models.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              ))}
              {avatarModels.length > 0 && (
                <optgroup label="Avatar / Lip-sync">
                  {avatarModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              )}
              {utilityModels.length > 0 && (
                <optgroup label="Utility">
                  {utilityModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>

        {selectedType !== 'text-to-video' && (
          <div className="p-2 rounded-lg text-xs" style={{ background: 'var(--accent-subtle)', color: 'var(--text2)' }}>
            {selectedType === 'avatar' && 'Talking avatar: provide image + audio file'}
            {selectedType === 'lip-sync' && 'Lip-sync: provide video + audio file'}
            {selectedType === 'motion-control' && 'Motion control: image + reference video for motion transfer'}
            {selectedType === 'start-end-frame' && 'Start/end frame: provide start image + optional end image'}
            {selectedType === 'multi-reference' && 'Multi-reference: provide 2+ reference images'}
            {selectedType === 'video-edit' && 'Video edit: provide source video + describe changes'}
            {selectedType === 'utility' && 'Utility: provide source video for processing'}
            {selectedType === 'image-to-video' && 'Image to video: provide source image + prompt'}
          </div>
        )}

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
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration (seconds)</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full">
              {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
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
