'use client';

import { useState, useEffect, useCallback } from 'react';
import AppShell from '@/components/AppShell';
import { useProject } from '@/lib/ProjectContext';
import { Template, Generation } from '@/lib/types';
import { getSessionUser } from '@/lib/auth';
import {
  IMAGE_MODEL_OPTIONS, IMAGE_MODEL_GROUPS,
  VIDEO_MODEL_OPTIONS, VIDEO_MODEL_GROUPS,
  DEVICE_PRESETS, getImageModelFormat, imageSizeToAspectRatio,
} from '@/lib/models';
import VersionHistory from '@/components/VersionHistory';
import ImagePicker from '@/components/ImagePicker';

type View = 'list' | 'create' | 'use';

function TemplatesContent() {
  const user = getSessionUser();
  const { activeProject } = useProject();
  const [view, setView] = useState<View>('list');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  const load = useCallback(async () => {
    const res = await fetch('/api/templates');
    const data = await res.json();
    if (Array.isArray(data)) setTemplates(data);
  }, []);

  useEffect(() => { load(); }, [load]);

  function handleUse(tmpl: Template) {
    setSelectedTemplate(tmpl);
    setView('use');
  }

  async function handleDelete(id: string) {
    if (!confirm('Delete this template?')) return;
    await fetch(`/api/templates?id=${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div>
      {view === 'list' && (
        <TemplateList
          templates={templates}
          onUse={handleUse}
          onDelete={handleDelete}
          onCreate={() => setView('create')}
        />
      )}
      {view === 'create' && (
        <TemplateForm
          userId={user?.userId || ''}
          onSave={() => { load(); setView('list'); }}
          onCancel={() => setView('list')}
        />
      )}
      {view === 'use' && selectedTemplate && (
        <TemplateRunner
          template={selectedTemplate}
          onBack={() => setView('list')}
          projectId={activeProject?.id}
          userId={user?.userId}
          falKey={user?.falKey}
        />
      )}
    </div>
  );
}

function TemplateList({ templates, onUse, onDelete, onCreate }: {
  templates: Template[];
  onUse: (t: Template) => void;
  onDelete: (id: string) => void;
  onCreate: () => void;
}) {
  const { activeProject } = useProject();

  return (
    <>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold">Templates</h2>
          {activeProject && <p className="text-sm" style={{ color: 'var(--text3)' }}>Project: {activeProject.title}</p>}
        </div>
        <button
          onClick={onCreate}
          className="px-4 py-2 rounded-lg text-sm font-semibold text-white"
          style={{ background: 'var(--accent)' }}
        >
          + New Template
        </button>
      </div>

      {templates.length === 0 ? (
        <div className="rounded-xl p-8 text-center" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="font-medium mb-1" style={{ color: 'var(--text2)' }}>No templates yet</p>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>Create a template to save model + params + prompt presets for quick generation.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {templates.map(tmpl => (
            <div key={tmpl.id} className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="font-semibold">{tmpl.name}</h3>
                  {tmpl.description && <p className="text-sm mt-0.5" style={{ color: 'var(--text2)' }}>{tmpl.description}</p>}
                </div>
                <div className="flex gap-1">
                  <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
                    {tmpl.type}
                  </span>
                  {tmpl.device !== 'any' && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)', color: 'var(--text3)' }}>
                      {tmpl.device.toUpperCase()}
                    </span>
                  )}
                </div>
              </div>
              <p className="text-xs mb-3" style={{ color: 'var(--text3)' }}>{tmpl.modelLabel}</p>
              <p className="text-sm mb-4 line-clamp-2" style={{ color: 'var(--text2)' }}>{tmpl.promptTemplate}</p>
              <div className="flex gap-2">
                <button
                  onClick={() => onUse(tmpl)}
                  className="flex-1 py-2 rounded-lg text-sm font-medium text-white"
                  style={{ background: 'var(--accent)' }}
                >
                  Use Template
                </button>
                <button
                  onClick={() => onDelete(tmpl.id)}
                  className="px-3 py-2 rounded-lg text-sm"
                  style={{ color: 'var(--red)', background: 'rgba(239,68,68,0.08)' }}
                >
                  Del
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function TemplateForm({ userId, onSave, onCancel }: {
  userId: string;
  onSave: () => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [type, setType] = useState<'image' | 'video'>('video');
  const [device, setDevice] = useState<string>('any');
  const [modelId, setModelId] = useState(VIDEO_MODEL_OPTIONS[0].id);
  const [promptTemplate, setPromptTemplate] = useState('');
  const [size, setSize] = useState('portrait_16_9');
  const [duration, setDuration] = useState(5);
  const [count, setCount] = useState(1);
  const [saving, setSaving] = useState(false);

  const modelOptions = type === 'image' ? IMAGE_MODEL_OPTIONS : VIDEO_MODEL_OPTIONS;
  const modelGroups = type === 'image' ? IMAGE_MODEL_GROUPS : VIDEO_MODEL_GROUPS;

  useEffect(() => {
    setModelId(modelOptions[0].id);
  }, [type, modelOptions]);

  async function handleSave() {
    if (!name.trim() || !promptTemplate.trim()) return;
    setSaving(true);
    const modelOpt = modelOptions.find(m => m.id === modelId);
    const params: Record<string, unknown> = type === 'image'
      ? { size, count, format: getImageModelFormat(modelId) }
      : { duration };

    await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: name.trim(),
        description: description.trim(),
        type,
        device,
        modelId,
        modelLabel: modelOpt?.label || modelId,
        promptTemplate: promptTemplate.trim(),
        params,
        referenceUrls: [],
        createdBy: userId,
      }),
    });
    setSaving(false);
    onSave();
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onCancel} className="text-sm" style={{ color: 'var(--text3)' }}>Back</button>
        <h2 className="text-xl font-semibold">New Template</h2>
      </div>

      <div className="space-y-5 max-w-2xl">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Template Name</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="Corporate Avatar HH" className="w-full" />
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Type</label>
            <select value={type} onChange={e => setType(e.target.value as 'image' | 'video')} className="w-full">
              <option value="image">Image</option>
              <option value="video">Video</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Description</label>
          <input value={description} onChange={e => setDescription(e.target.value)} placeholder="Short description..." className="w-full" />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Device</label>
            <select value={device} onChange={e => setDevice(e.target.value)} className="w-full">
              <option value="any">Any</option>
              {Object.entries(DEVICE_PRESETS).map(([key, preset]) => (
                <option key={key} value={key}>{preset.name} ({preset.width}x{preset.height})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
            <select value={modelId} onChange={e => setModelId(e.target.value)} className="w-full">
              {modelGroups.map(group => (
                <optgroup key={group.id} label={group.label}>
                  {group.modelIds.map(id => {
                    const opt = modelOptions.find(o => o.id === id);
                    return opt ? <option key={id} value={id}>{opt.label}</option> : null;
                  })}
                </optgroup>
              ))}
            </select>
          </div>
        </div>

        {type === 'image' && (
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
                {[1, 2, 4].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
          </div>
        )}

        {type === 'video' && (
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration (seconds)</label>
            <select value={duration} onChange={e => setDuration(Number(e.target.value))} className="w-full">
              {[3, 4, 5, 6, 7, 8, 10].map(d => <option key={d} value={d}>{d}s</option>)}
            </select>
          </div>
        )}

        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt Template</label>
          <textarea
            value={promptTemplate}
            onChange={e => setPromptTemplate(e.target.value)}
            placeholder="Professional full-body portrait of a person standing in a relaxed pose, clean white background, studio lighting..."
            className="w-full h-32 resize-none"
          />
          <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>Tip: this prompt will be used for all generations from this template.</p>
        </div>

        <div className="flex gap-3 pt-2">
          <button onClick={onCancel} className="px-5 py-2.5 rounded-lg text-sm" style={{ color: 'var(--text2)', background: 'var(--bg-input)' }}>Cancel</button>
          <button
            onClick={handleSave}
            disabled={saving || !name.trim() || !promptTemplate.trim()}
            className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
            style={{ background: 'var(--accent)' }}
          >
            {saving ? 'Saving...' : 'Create Template'}
          </button>
        </div>
      </div>
    </>
  );
}

function TemplateRunner({ template, onBack, projectId, userId, falKey }: {
  template: Template;
  onBack: () => void;
  projectId?: string;
  userId?: string;
  falKey?: string;
}) {
  const [prompt, setPrompt] = useState(template.promptTemplate);
  const [sourceImage, setSourceImage] = useState('');
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ url: string }[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);

  const loadHistory = useCallback(async () => {
    if (!projectId) return;
    const res = await fetch(`/api/generations?projectId=${projectId}&type=${template.type}`);
    const data = await res.json();
    if (Array.isArray(data)) {
      setHistory(data.filter((g: Generation) => g.params.templateId === template.id));
    }
  }, [projectId, template.id, template.type]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleGenerate() {
    if (!prompt.trim() || !projectId) return;
    setGenerating(true);
    setError('');
    try {
      const body: Record<string, unknown> = {
        type: template.type,
        model: template.modelId,
        prompt: prompt.trim(),
        falKey,
      };

      if (template.type === 'image') {
        const format = getImageModelFormat(template.modelId);
        body.size = template.params.size || 'portrait_16_9';
        body.count = template.params.count || 1;
        body.format = format;
        if (format === 'aspect_ratio') {
          body.aspectRatio = imageSizeToAspectRatio(body.size as string);
        }
      } else {
        body.duration = template.params.duration || 5;
        if (sourceImage) body.sourceImage = sourceImage;
      }

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);

      const resultUrls: string[] = template.type === 'image'
        ? (data.images || []).map((img: { url: string }) => img.url)
        : data.video ? [data.video.url] : [];

      setResults(prev => [...resultUrls.map(url => ({ url })), ...prev]);

      await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          userId,
          type: template.type,
          modelId: template.modelId,
          modelLabel: template.modelLabel,
          prompt: prompt.trim(),
          params: { ...template.params, templateId: template.id, templateName: template.name },
          referenceUrls: sourceImage ? [sourceImage] : [],
          resultUrls,
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

  if (!projectId) {
    return (
      <div className="text-center py-16">
        <p className="text-lg mb-2" style={{ color: 'var(--text2)' }}>No project selected</p>
        <p className="text-sm" style={{ color: 'var(--text3)' }}>Create a project in the sidebar first.</p>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-6">
        <button onClick={onBack} className="text-sm" style={{ color: 'var(--text3)' }}>Back</button>
        <div>
          <h2 className="text-xl font-semibold">{template.name}</h2>
          <p className="text-sm" style={{ color: 'var(--text3)' }}>{template.modelLabel} | {template.type} | {template.device !== 'any' ? template.device.toUpperCase() : 'Any device'}</p>
        </div>
      </div>

      <div className="space-y-5 max-w-2xl">
        <div>
          <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt (editable)</label>
          <textarea value={prompt} onChange={e => setPrompt(e.target.value)} className="w-full h-28 resize-none" />
        </div>

        {template.type === 'video' && (
          <ImagePicker value={sourceImage} onChange={setSourceImage} />
        )}

        <div className="flex items-center justify-between pt-2">
          <div className="flex gap-2 text-xs" style={{ color: 'var(--text3)' }}>
            {Object.entries(template.params).filter(([k]) => !k.startsWith('template')).map(([k, v]) => (
              <span key={k} className="px-2 py-0.5 rounded" style={{ background: 'var(--bg-input)' }}>{k}: {String(v)}</span>
            ))}
          </div>
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
            ) : 'Generate'}
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
          <div className={template.type === 'image' ? 'grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3' : 'grid grid-cols-1 md:grid-cols-2 gap-4'}>
            {results.map((item, i) => (
              <div key={i} className="rounded-xl overflow-hidden border group relative" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                {template.type === 'image' ? (
                  <img src={item.url} alt="" className="w-full aspect-[9/16] object-cover" />
                ) : (
                  <video src={item.url} controls className="w-full" />
                )}
                <div className="p-2">
                  <a href={item.url} target="_blank" rel="noopener noreferrer"
                    className="block py-1.5 rounded text-xs text-center text-white font-medium"
                    style={{ background: 'var(--accent)' }}>
                    Download
                  </a>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {history.length > 0 && (
        <VersionHistory generations={history} onSelect={() => {}} />
      )}
    </>
  );
}

export default function TemplatesPage() {
  return <AppShell><TemplatesContent /></AppShell>;
}
