'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  IMAGE_MODEL_OPTIONS, IMAGE_MODEL_GROUPS, IMAGE_SIZE_OPTIONS, IMAGE_RESOLUTION_OPTIONS,
} from '@/lib/models';
import { getSessionUser } from '@/lib/auth';
import { useProject } from '@/lib/ProjectContext';
import { Generation, GenerationCost } from '@/lib/types';
import { useProjectCache } from '@/lib/useProjectCache';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';
import VersionHistory from '@/components/VersionHistory';

interface GeneratedImage {
  url: string;
  seed?: number;
}

interface AgentResult {
  prompt: string;
  selectedModel: string;
  selectedModelLabel: string;
  params: { size: string; resolution: string };
  reasoning: string;
  paramNotes?: string[];
  estimatedCost?: GenerationCost;
}

type Step = 'input' | 'review' | 'generating';

export default function GenerateImagePage() {
  const user = getSessionUser();
  const { activeProject } = useProject();

  // Step 1: User input
  const [references, setReferences] = useState<{ url: string; name: string }[]>([]);
  const [modelPref, setModelPref] = useState('auto');
  const [instruction, setInstruction] = useState('');
  const [desiredSize, setDesiredSize] = useState('portrait_16_9');
  const [desiredResolution, setDesiredResolution] = useState('1k');

  // Agent result (shown after generation)
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);

  // Editable fields for review step
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');

  // State
  const [step, setStep] = useState<Step>('input');
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Per-project cache
  const { cache, loaded: cacheLoaded, saveCache } = useProjectCache(activeProject?.id, 'image');
  const cacheRestoredRef = useRef(false);

  useEffect(() => {
    if (!cacheLoaded || cacheRestoredRef.current) return;
    if (cache) {
      if (cache.references?.length) setReferences(cache.references);
      if (cache.instruction) setInstruction(cache.instruction);
      if (cache.modelPref) setModelPref(cache.modelPref);
      if (cache.desiredSize) setDesiredSize(cache.desiredSize);
      if (cache.desiredResolution) setDesiredResolution(cache.desiredResolution);
    }
    cacheRestoredRef.current = true;
  }, [cacheLoaded, cache]);

  useEffect(() => {
    if (!activeProject) return;
    setReferences([]);
    setInstruction('');
    setModelPref('auto');
    setDesiredSize('portrait_16_9');
    setDesiredResolution('1k');
    setAgentResult(null);
    setResults([]);
    setError('');
    setStep('input');
    cacheRestoredRef.current = false;
  }, [activeProject?.id]);

  useEffect(() => {
    if (!cacheRestoredRef.current) return;
    saveCache({ references, instruction, modelPref, desiredSize, desiredResolution });
  }, [references, instruction, modelPref, desiredSize, desiredResolution, saveCache]);

  const loadHistory = useCallback(async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/generations?projectId=${activeProject.id}&type=image`);
    const data = await res.json();
    if (Array.isArray(data)) setHistory(data);
  }, [activeProject]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    for (const file of Array.from(files)) {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/upload', { method: 'POST', body: formData });
      const data = await res.json();
      if (data.url) setReferences(prev => [...prev, { url: data.url, name: file.name }]);
    }
    e.target.value = '';
  }

  async function handlePrepare() {
    if (!instruction.trim() || !activeProject) return;
    setPreparing(true);
    setError('');
    setAgentResult(null);
    try {
      const res = await fetch('/api/prepare-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          instruction: instruction.trim(),
          model: modelPref === 'auto' ? undefined : modelPref,
          size: desiredSize,
          references: references.map(r => r.url),
          falKey: user?.falKey,
          systemPrompt: user?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgentResult({
        prompt: data.prompt || '',
        selectedModel: data.model || '',
        selectedModelLabel: data.modelLabel || '',
        params: { size: desiredSize, resolution: desiredResolution },
        reasoning: data.reasoning || '',
        estimatedCost: data.estimatedCost || undefined,
      });
      setEditPrompt(data.prompt || '');
      setEditModel(data.model || '');
      setStep('review');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Preparation failed');
    } finally {
      setPreparing(false);
    }
  }

  function handleBack() {
    setStep('input');
  }

  async function handleGenerate() {
    if (!editPrompt.trim() || !activeProject) return;
    setGenerating(true);
    setStep('generating');
    setError('');
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'image',
          instruction: editPrompt.trim(),
          model: editModel,
          size: desiredSize,
          references: references.map(r => r.url),
          falKey: user?.falKey,
          systemPrompt: user?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      const images: GeneratedImage[] = data.images || [];
      setResults(prev => [...images, ...prev]);

      await fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          userId: user?.userId,
          type: 'image',
          modelId: editModel || modelPref,
          modelLabel: agentResult?.selectedModelLabel || modelPref,
          prompt: editPrompt.trim(),
          params: {
            size: desiredSize, count: 1,
            instruction: instruction.trim(),
            agentReasoning: agentResult?.reasoning,
          },
          referenceUrls: references.map(r => r.url),
          resultUrls: images.map(img => img.url),
          status: 'completed',
          estimatedCost: agentResult?.estimatedCost || undefined,
          actualCost: data.cost || undefined,
        }),
      });
      loadHistory();
      setStep('input');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setStep('input');
    } finally {
      setGenerating(false);
    }
  }

  function handleSelectVersion(gen: Generation) {
    if (gen.params.instruction) setInstruction(gen.params.instruction as string);
    if (gen.params.size) setDesiredSize(gen.params.size as string);
    setModelPref(gen.modelId);
    setReferences((gen.referenceUrls || []).map((url, i) => ({ url, name: `Reference ${i + 1}` })));
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

      {step === 'input' && (
        <div className="space-y-5">
          {/* References at top with numbering */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>
              References {references.length > 0 && <span style={{ color: 'var(--text3)' }}>({references.length})</span>}
            </label>
            <div className="flex flex-wrap gap-2">
              {references.map((ref, i) => (
                <div key={i} className="relative w-20 h-20 rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <span className="absolute top-0 left-0 z-10 w-6 h-6 flex items-center justify-center rounded-br-lg text-xs font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{i + 1}</span>
                  <img src={ref.url} alt={ref.name} className="w-full h-full object-cover" />
                  <button
                    onClick={() => setReferences(prev => prev.filter((_, j) => j !== i))}
                    className="absolute top-0 right-0 w-5 h-5 flex items-center justify-center text-xs rounded-bl-lg"
                    style={{ background: 'var(--red)', color: 'white' }}
                  >x</button>
                  <div className="absolute bottom-0 left-0 right-0 bg-black/60 text-[10px] text-white px-1 truncate">{ref.name}</div>
                </div>
              ))}
              <button
                onClick={() => fileRef.current?.click()}
                className="w-20 h-20 rounded-lg border-2 border-dashed flex flex-col items-center justify-center text-xs gap-1"
                style={{ borderColor: 'var(--border)', color: 'var(--text3)' }}
              >
                <span className="text-2xl">+</span>
                <span>Add</span>
              </button>
              <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileUpload} />
            </div>
            {references.length > 0 && (
              <p className="text-xs mt-1" style={{ color: 'var(--text3)' }}>
                Reference by number in your instruction: &quot;image 1&quot;, &quot;image 2&quot;, etc.
              </p>
            )}
          </div>

          {/* Model preference */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select value={modelPref} onChange={e => setModelPref(e.target.value)} className="w-full">
                <option value="auto">Auto (agent selects)</option>
                <optgroup label="By Group">
                  {IMAGE_MODEL_GROUPS.map(g => (
                    <option key={g.id} value={`group:${g.id}`}>{g.label} ({g.modelIds.length})</option>
                  ))}
                </optgroup>
                <optgroup label="Specific Model">
                  {IMAGE_MODEL_OPTIONS.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Format</label>
              <select value={desiredSize} onChange={e => setDesiredSize(e.target.value)} className="w-full">
                {IMAGE_SIZE_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Resolution</label>
            <select value={desiredResolution} onChange={e => setDesiredResolution(e.target.value)} className="w-full">
              {IMAGE_RESOLUTION_OPTIONS.map(o => (
                <option key={o.id} value={o.id}>{o.label}</option>
              ))}
            </select>
          </div>

          {/* Instruction */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Instruction</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Describe what you want. E.g.: Take image 1 and change the background to a futuristic city. Use the style from image 2..."
              className="w-full h-32 resize-none"
            />
            <div className="text-xs mt-1 text-right" style={{ color: 'var(--text3)' }}>
              {instruction.length} chars
            </div>
          </div>

          {/* Prepare button */}
          <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              AI agent will craft the prompt and select the best model
            </p>
            <button
              onClick={handlePrepare}
              disabled={preparing || !instruction.trim() || !user?.falKey}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: preparing ? 'var(--text3)' : 'var(--accent)' }}
            >
              {preparing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Preparing...
                </span>
              ) : 'Prepare Generation'}
            </button>
          </div>

          {!user?.falKey && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              Add your fal.ai API key in Settings to enable generation.
            </div>
          )}
        </div>
      )}

      {step === 'review' && agentResult && (
        <div className="space-y-5">
          {/* Agent reasoning */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>
                  Agent selected: {agentResult.selectedModelLabel || agentResult.selectedModel}
                </p>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>{agentResult.reasoning}</p>
              </div>
              {agentResult.estimatedCost && (
                <div className="flex-shrink-0 text-right">
                  <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Est. cost</p>
                  <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                    ${agentResult.estimatedCost.amount.toFixed(2)}
                  </p>
                  {agentResult.estimatedCost.details && (
                    <p className="text-xs" style={{ color: 'var(--text3)' }}>{agentResult.estimatedCost.details}</p>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Editable prompt */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt</label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              className="w-full h-40 resize-none"
            />
          </div>

          {/* Editable model */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select value={editModel} onChange={e => setEditModel(e.target.value)} className="w-full">
                {IMAGE_MODEL_OPTIONS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Back + Generate buttons */}
          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={handleBack}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              Back
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating || !editPrompt.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              Generate Image
            </button>
          </div>
        </div>
      )}

      {step === 'generating' && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text2)' }}>Generating image...</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>Using the approved prompt and model</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {agentResult && step === 'input' && (
        <div className="mt-6 p-4 rounded-xl" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)' }}>
          <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>
            Last generation: {agentResult.selectedModelLabel || agentResult.selectedModel}
          </p>
          <p className="text-sm mb-2" style={{ color: 'var(--text2)' }}>{agentResult.reasoning}</p>
          {agentResult.prompt && (
            <details className="text-xs" style={{ color: 'var(--text3)' }}>
              <summary className="cursor-pointer">Generated prompt</summary>
              <p className="mt-1 whitespace-pre-wrap">{agentResult.prompt}</p>
            </details>
          )}
        </div>
      )}

      {results.length > 0 && (
        <div className="mt-8">
          <h3 className="text-lg font-semibold mb-4">Results ({results.length})</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {results.map((img, i) => (
              <div key={i} className="rounded-xl overflow-hidden border group relative" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                <img src={img.url} alt="" className="w-full aspect-square object-contain" style={{ background: 'var(--bg-input)' }} />
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
