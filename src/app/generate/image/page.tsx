'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import {
  IMAGE_MODEL_OPTIONS, IMAGE_MODEL_GROUPS, IMAGE_SIZE_OPTIONS, IMAGE_RESOLUTION_OPTIONS,
} from '@/lib/models';
import { useProject } from '@/lib/ProjectContext';
import { Generation, GenerationCost, JobData } from '@/lib/types';
import { useProjectCache } from '@/lib/useProjectCache';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';
import VersionHistory from '@/components/VersionHistory';
import StepBar from '@/components/StepBar';

interface GeneratedImage {
  url: string;
  seed?: number;
}

type Step = 'input' | 'review' | 'generating';

export default function GenerateImagePage() {
  const { user, activeProject } = useProject();

  // User input
  const [references, setReferences] = useState<{ url: string; name: string }[]>([]);
  const [modelPref, setModelPref] = useState('auto');
  const [instruction, setInstruction] = useState('');
  const [desiredSize, setDesiredSize] = useState('portrait_16_9');
  const [desiredResolution, setDesiredResolution] = useState('1k');

  // Editable fields for review step
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');

  // State
  const [results, setResults] = useState<GeneratedImage[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);

  // Dynamic pricing
  const [pricingLoading, setPricingLoading] = useState(false);
  const [dynamicCost, setDynamicCost] = useState<GenerationCost | null>(null);

  // Job state
  const [job, setJob] = useState<JobData | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const completedRef = useRef<string | null>(null);
  const [viewStep, setViewStep] = useState<'input' | 'review'>('input');

  // Per-project cache
  const { cache, loaded: cacheLoaded, saveCache } = useProjectCache(activeProject?.id, 'image');
  const cacheRestoredRef = useRef(false);

  useEffect(() => {
    if (!cacheLoaded || cacheRestoredRef.current) return;
    if (cache) {
      if (cache.references?.length) setReferences(cache.references);
      if (cache.instruction) setInstruction(cache.instruction);
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
    setResults([]);
    setError('');
    setEditPrompt('');
    setEditModel('');
    setDynamicCost(null);
    setJob(null);
    jobIdRef.current = null;
    completedRef.current = null;
    cacheRestoredRef.current = false;
    setViewStep('input');
  }, [activeProject?.id]);

  useEffect(() => {
    if (!cacheRestoredRef.current) return;
    saveCache({ references, instruction, modelPref, desiredSize, desiredResolution });
  }, [references, instruction, modelPref, desiredSize, desiredResolution, saveCache]);

  // Check for active job on mount / project change
  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    fetch(`/api/jobs?projectId=${activeProject.id}&type=image`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.active) return;
        const j: JobData = data.active;
        jobIdRef.current = j.id;
        setJob(j);
        if (j.status === 'prepared' && j.prepareResult) {
          setEditPrompt(j.prepareResult.prompt);
          setEditModel(j.prepareResult.model);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [activeProject?.id]);

  // Poll active job (stop once prepared — user may edit fields)
  useEffect(() => {
    const id = jobIdRef.current;
    if (!id) return;
    if (job?.status === 'complete' || job?.status === 'error' || job?.status === 'prepared') return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/${id}`);
        if (!res.ok) {
          if (res.status === 404) {
            jobIdRef.current = null;
            setJob(null);
            setError('Job expired. Please try again.');
          }
          return;
        }
        const data: JobData = await res.json();
        setJob(data);
        if (data.status === 'prepared' && data.prepareResult) {
          setEditPrompt(data.prepareResult.prompt);
          setEditModel(data.prepareResult.model);
        }
      } catch { /* ignore */ }
    }, 1500);
    return () => clearInterval(interval);
  }, [job?.status]);

  // Handle job completion
  useEffect(() => {
    if (!job || !activeProject) return;
    if (job.status === 'complete' && job.result && completedRef.current !== job.id) {
      completedRef.current = job.id;
      const imgs = job.result.images || [];
      setResults(prev => [...imgs, ...prev]);
      const cost = dynamicCost || job.prepareResult?.estimatedCost;
      fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          type: 'image',
          modelId: job.result.model || editModel || modelPref,
          modelLabel: job.result.modelLabel || job.prepareResult?.modelLabel || modelPref,
          prompt: job.result.prompt || editPrompt,
          params: {
            size: desiredSize, count: 1,
            instruction: instruction.trim(),
            agentReasoning: job.prepareResult?.reasoning,
          },
          referenceUrls: references.map(r => r.url),
          resultUrls: imgs.map(img => img.url),
          status: 'completed',
          estimatedCost: cost || undefined,
          actualCost: job.result.cost || undefined,
        }),
      }).then(() => loadHistory()).catch(() => {});
      jobIdRef.current = null;
    }
    if (job.status === 'error') {
      setError(job.error || 'Unknown error');
      jobIdRef.current = null;
    }
  }, [job?.status, job?.id]);

  const loadHistory = useCallback(async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/generations?projectId=${activeProject.id}&type=image`);
    const data = await res.json();
    if (Array.isArray(data)) setHistory(data);
  }, [activeProject]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  // Pricing
  const fetchPricingRef = useRef(0);
  async function fetchPricing(modelId: string) {
    if (!user?.hasFalKey || !modelId || modelId === 'auto' || modelId.startsWith('group:')) {
      setDynamicCost(null);
      return;
    }
    const callId = ++fetchPricingRef.current;
    setPricingLoading(true);
    try {
      const res = await fetch('/api/pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (callId !== fetchPricingRef.current) return;
      const data = await res.json();
      if (data.amount != null) {
        setDynamicCost({ amount: data.amount, currency: data.currency || 'USD', details: data.details || '' });
      } else {
        setDynamicCost(null);
      }
    } catch {
      if (callId === fetchPricingRef.current) setDynamicCost(null);
    } finally {
      if (callId === fetchPricingRef.current) setPricingLoading(false);
    }
  }

  const jobStep: Step = (() => {
    if (!job || job.status === 'complete' || job.status === 'error') return 'input';
    if (job.status === 'prepared') return 'review';
    if (job.status === 'generating') return 'generating';
    return 'input';
  })();

  const isPreparing = job?.status === 'preparing';
  const hasPrepared = jobStep === 'review';
  const effectiveView: Step = jobStep === 'generating' ? 'generating' : hasPrepared ? viewStep : 'input';

  const prevJobStepRef = useRef<Step>('input');
  useEffect(() => {
    if (jobStep === 'review' && prevJobStepRef.current !== 'review') {
      setViewStep('review');
    }
    prevJobStepRef.current = jobStep;
  }, [jobStep]);

  useEffect(() => {
    if (effectiveView !== 'input') return;
    if (modelPref === 'auto' || modelPref.startsWith('group:')) {
      setDynamicCost(null);
      return;
    }
    const timer = setTimeout(() => fetchPricing(modelPref), 300);
    return () => clearTimeout(timer);
  }, [modelPref, effectiveView]);

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
    setError('');
    setDynamicCost(null);
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          type: 'image',
          instruction: instruction.trim(),
          model: modelPref === 'auto' ? undefined : modelPref,
          size: desiredSize,
          references: references.map(r => r.url),
          systemPrompt: user?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      jobIdRef.current = data.id;
      completedRef.current = null;
      setJob(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start preparation');
    }
  }

  function handleBack() {
    setViewStep('input');
  }

  async function handleGenerate() {
    if (!editPrompt.trim() || !jobIdRef.current) return;
    setError('');
    try {
      const res = await fetch(`/api/jobs/${jobIdRef.current}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: editPrompt.trim(), model: editModel }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setJob(data);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to start generation');
    }
  }

  function handleSelectVersion(gen: Generation) {
    if (gen.params.instruction) setInstruction(gen.params.instruction as string);
    if (gen.params.size) setDesiredSize(gen.params.size as string);
    setReferences((gen.referenceUrls || []).map((url, i) => ({ url, name: `Reference ${i + 1}` })));
    setResults(gen.resultUrls.map(url => ({ url })));
    setEditPrompt(gen.prompt);
    setEditModel(gen.modelId);
    setDynamicCost(null);
    jobIdRef.current = null;
    setJob({
      id: 'review-' + gen.id,
      userId: '', projectId: '', type: 'image',
      status: 'prepared',
      input: {},
      prepareResult: {
        prompt: gen.prompt,
        model: gen.modelId,
        modelLabel: gen.modelLabel,
        reasoning: (gen.params.agentReasoning as string) || '',
        estimatedCost: gen.estimatedCost || gen.actualCost || undefined,
      },
      createdAt: gen.createdAt,
      updatedAt: gen.createdAt,
    });
    setViewStep('review');
  }

  async function handleDeleteVersion(genId: string) {
    if (!activeProject) return;
    await fetch(`/api/generations?projectId=${activeProject.id}&generationId=${genId}`, { method: 'DELETE' });
    loadHistory();
  }

  const displayCost = dynamicCost || job?.prepareResult?.estimatedCost || null;

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
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-semibold">Generate Image</h2>
        <span className="px-2.5 py-0.5 rounded-full text-xs font-medium"
          style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
          {activeProject.title}
        </span>
      </div>

      <StepBar
        current={effectiveView}
        hasPrepared={hasPrepared}
        isPreparing={isPreparing}
        onStepClick={setViewStep}
      />

      {effectiveView === 'input' && (
        <div className="space-y-5">
          <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
            <p className="text-sm font-medium" style={{ color: 'var(--text1)' }}>
              References {references.length > 0 && <span style={{ color: 'var(--text3)' }}>({references.length})</span>}
            </p>

            <div className="p-2 rounded-lg text-xs" style={{ background: 'var(--accent-subtle)', color: 'var(--text2)' }}>
              Upload reference images for editing, style transfer, or compositing. Reference by number: &quot;image 1&quot;, &quot;image 2&quot;, etc.
            </div>

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
          </div>

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

          {(dynamicCost || pricingLoading) && effectiveView === 'input' && (
            <div className="p-3 rounded-lg flex items-center gap-3" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.15)' }}>
              {pricingLoading ? (
                <>
                  <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                  <span className="text-sm" style={{ color: 'var(--text3)' }}>Fetching price...</span>
                </>
              ) : dynamicCost ? (
                <>
                  <span className="text-lg font-bold" style={{ color: 'var(--accent)' }}>${(dynamicCost.amount ?? 0).toFixed(3)}</span>
                  <span className="text-sm" style={{ color: 'var(--text3)' }}>est. per image{dynamicCost.details ? ` — ${dynamicCost.details}` : ''}</span>
                </>
              ) : null}
            </div>
          )}

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

          <div className="flex items-center justify-between gap-3 pt-2">
            {hasPrepared ? (
              <button
                onClick={() => setViewStep('review')}
                className="px-4 py-2.5 rounded-lg text-sm font-medium"
                style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
              >
                Review &rarr;
              </button>
            ) : (
              <p className="text-xs" style={{ color: 'var(--text3)' }}>
                AI agent will craft the prompt and select the best model
              </p>
            )}
            <button
              onClick={handlePrepare}
              disabled={isPreparing || !instruction.trim() || !user?.hasFalKey}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: isPreparing ? 'var(--text3)' : 'var(--accent)' }}
            >
              {isPreparing ? (
                <span className="flex items-center gap-2">
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Preparing...
                </span>
              ) : hasPrepared ? 'Re-prepare' : 'Prepare Generation'}
            </button>
          </div>

          {!user?.hasFalKey && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              Add your fal.ai API key in Settings to enable generation.
            </div>
          )}
        </div>
      )}

      {effectiveView === 'review' && job?.prepareResult && (
        <div className="space-y-5">
          <div className="p-4 rounded-xl" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)' }}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>
                  Agent selected: {job.prepareResult.modelLabel || job.prepareResult.model}
                </p>
                <p className="text-sm" style={{ color: 'var(--text2)' }}>{job.prepareResult.reasoning}</p>
              </div>
              <div className="flex-shrink-0 text-right">
                {pricingLoading ? (
                  <>
                    <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Est. cost</p>
                    <span className="inline-block w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                  </>
                ) : displayCost ? (
                  <>
                    <p className="text-xs font-medium" style={{ color: 'var(--text3)' }}>Est. cost</p>
                    <p className="text-lg font-bold" style={{ color: 'var(--accent)' }}>
                      ${(displayCost.amount ?? 0).toFixed(3)}
                    </p>
                    {displayCost.details && (
                      <p className="text-xs" style={{ color: 'var(--text3)' }}>{displayCost.details}</p>
                    )}
                  </>
                ) : null}
              </div>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt</label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              className="w-full h-40 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select
                value={editModel}
                onChange={e => { setEditModel(e.target.value); fetchPricing(e.target.value); }}
                className="w-full"
              >
                {IMAGE_MODEL_OPTIONS.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-2">
            <button
              onClick={handleBack}
              className="px-4 py-2.5 rounded-lg text-sm font-medium"
              style={{ color: 'var(--text2)', border: '1px solid var(--border)' }}
            >
              &larr; Configure
            </button>
            <button
              onClick={handleGenerate}
              disabled={!editPrompt.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
              style={{ background: 'var(--accent)' }}
            >
              Generate Image
            </button>
          </div>
        </div>
      )}

      {effectiveView === 'generating' && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text2)' }}>Generating image...</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>You can navigate away — generation continues on the server</p>
        </div>
      )}

      {error && (
        <div className="mt-4 p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
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
