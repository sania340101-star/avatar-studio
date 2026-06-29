'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  VIDEO_MODEL_OPTIONS,
  VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS,
  VIDEO_ASPECT_RATIO_OPTIONS,
  VIDEO_QUALITY_OPTIONS,
  VIDEO_FPS_OPTIONS,
  VIDEO_STRATEGY_OPTIONS,
  filterVideoModelsByType,
  getVideoModelType,
  isVideoModelGroupId,
  aspectRatioToNumeric,
} from '@/lib/models';
import { useProject } from '@/lib/ProjectContext';
import { VideoModelTypeFilter, Generation, GenerationCost, TemplateRef, JobData } from '@/lib/types';
import { useProjectCache } from '@/lib/useProjectCache';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';
import VersionHistory from '@/components/VersionHistory';
import StepBar from '@/components/StepBar';

type Step = 'input' | 'review' | 'generating';

export default function GenerateVideoPage() {
  const { user, activeProject } = useProject();

  // User input
  const [typeFilter, setTypeFilter] = useState<VideoModelTypeFilter>('all');
  const [modelPref, setModelPref] = useState('auto');
  const [instruction, setInstruction] = useState('');
  const [desiredDuration, setDesiredDuration] = useState(5);
  const [aspectRatio, setAspectRatio] = useState('9:16');
  const [quality, setQuality] = useState('1k');
  const [fps, setFps] = useState(24);
  const [strategy, setStrategy] = useState('balance');
  const [sourceImage, setSourceImage] = useState('');
  const [sourceImageAR, setSourceImageAR] = useState<number | null>(null);
  const [sourceVideo, setSourceVideo] = useState<TemplateRef | null>(null);
  const [audioRef, setAudioRef] = useState<TemplateRef | null>(null);
  const [endImage, setEndImage] = useState('');
  const [multiRefs, setMultiRefs] = useState<TemplateRef[]>([]);

  // Editable fields for review step
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editAspectRatio, setEditAspectRatio] = useState('');
  const [editQuality, setEditQuality] = useState('');
  const [editFps, setEditFps] = useState(0);
  const [editDuration, setEditDuration] = useState(0);

  // State
  const [results, setResults] = useState<{ url: string }[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);
  const [pricingLoading, setPricingLoading] = useState(false);
  const [dynamicCost, setDynamicCost] = useState<GenerationCost | null>(null);
  const [unitPrice, setUnitPrice] = useState<{ amount: number; unit: string } | null>(null);

  // Job state
  const [job, setJob] = useState<JobData | null>(null);
  const jobIdRef = useRef<string | null>(null);
  const completedRef = useRef<string | null>(null);
  const [viewStep, setViewStep] = useState<'input' | 'review'>('input');

  // Per-project cache
  const { cache, loaded: cacheLoaded, saveCache } = useProjectCache(activeProject?.id, 'video');
  const cacheRestoredRef = useRef(false);

  useEffect(() => {
    if (!cacheLoaded || cacheRestoredRef.current) return;
    if (cache) {
      if (cache.instruction) setInstruction(cache.instruction);
      if (cache.modelPref) setModelPref(cache.modelPref);
      if (cache.typeFilter) setTypeFilter(cache.typeFilter as VideoModelTypeFilter);
      if (cache.desiredDuration) setDesiredDuration(cache.desiredDuration);
      if (cache.aspectRatio) setAspectRatio(cache.aspectRatio);
      if (cache.quality) setQuality(cache.quality);
      if (cache.fps) setFps(cache.fps);
      if (cache.strategy) setStrategy(cache.strategy);
      if (cache.sourceImage) setSourceImage(cache.sourceImage);
      if (cache.sourceVideo) setSourceVideo(cache.sourceVideo);
      if (cache.audioRef) setAudioRef(cache.audioRef);
      if (cache.endImage) setEndImage(cache.endImage);
      if (cache.multiRefs?.length) setMultiRefs(cache.multiRefs);
    }
    cacheRestoredRef.current = true;
  }, [cacheLoaded, cache]);

  useEffect(() => {
    if (!activeProject) return;
    setTypeFilter('all');
    setModelPref('auto');
    setInstruction('');
    setDesiredDuration(5);
    setAspectRatio('9:16');
    setQuality('1k');
    setFps(24);
    setStrategy('balance');
    setSourceImage('');
    setSourceVideo(null);
    setAudioRef(null);
    setEndImage('');
    setMultiRefs([]);
    setResults([]);
    setError('');
    setJob(null);
    jobIdRef.current = null;
    completedRef.current = null;
    cacheRestoredRef.current = false;
    setSourceImageAR(null);
    setViewStep('input');
    setDynamicCost(null);
  }, [activeProject?.id]);

  useEffect(() => {
    if (!sourceImage) { setSourceImageAR(null); return; }
    const img = document.createElement('img');
    img.onload = () => setSourceImageAR(img.naturalWidth / img.naturalHeight);
    img.onerror = () => setSourceImageAR(null);
    img.src = sourceImage;
  }, [sourceImage]);

  useEffect(() => {
    if (!cacheRestoredRef.current) return;
    saveCache({
      instruction, modelPref, typeFilter, desiredDuration,
      aspectRatio, quality, fps, strategy,
      sourceImage, sourceVideo, audioRef, endImage, multiRefs,
    });
  }, [instruction, modelPref, typeFilter, desiredDuration, aspectRatio, quality, fps, strategy, sourceImage, sourceVideo, audioRef, endImage, multiRefs, saveCache]);

  function applyPrepareResult(pr: JobData['prepareResult']) {
    if (!pr) return;
    setEditPrompt(pr.prompt);
    setEditModel(pr.model);
    setEditAspectRatio(pr.params?.aspectRatio || aspectRatio);
    setEditQuality(pr.params?.quality || quality);
    setEditFps(pr.params?.fps || fps);
    setEditDuration(pr.params?.duration || desiredDuration);
  }

  // Check for active job on mount / project change
  useEffect(() => {
    if (!activeProject) return;
    let cancelled = false;
    fetch(`/api/jobs?projectId=${activeProject.id}&type=video`)
      .then(r => r.json())
      .then(data => {
        if (cancelled || !data.active) return;
        const j: JobData = data.active;
        jobIdRef.current = j.id;
        setJob(j);
        if (j.status === 'prepared' && j.prepareResult) {
          applyPrepareResult(j.prepareResult);
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
          applyPrepareResult(data.prepareResult);
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
      if (job.result.video) {
        setResults(prev => [job.result!.video!, ...prev]);
      }
      const allRefUrls = [
        ...(sourceImage ? [sourceImage] : []),
        ...(sourceVideo ? [sourceVideo.url] : []),
        ...(audioRef ? [audioRef.url] : []),
        ...(endImage ? [endImage] : []),
        ...multiRefs.map(r => r.url),
      ];
      fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          type: 'video',
          modelId: job.result.model || editModel || modelPref,
          modelLabel: job.result.modelLabel || job.prepareResult?.modelLabel || modelPref,
          prompt: job.result.prompt || editPrompt,
          params: {
            duration: desiredDuration, typeFilter,
            aspectRatio, quality, fps, strategy,
            instruction: instruction.trim(),
            agentReasoning: job.prepareResult?.reasoning,
            sourceImage: sourceImage || undefined,
            sourceVideo: sourceVideo?.url,
            audioUrl: audioRef?.url,
            endImage: endImage || undefined,
            referenceImages: multiRefs.length > 0 ? multiRefs.map(r => r.url) : undefined,
          },
          referenceUrls: allRefUrls,
          resultUrls: job.result.video ? [job.result.video.url] : [],
          status: 'completed',
          estimatedCost: job.prepareResult?.estimatedCost || undefined,
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

  const filteredModels = filterVideoModelsByType(typeFilter);

  const selectedModelForRefs = isVideoModelGroupId(modelPref)
    ? null
    : VIDEO_MODEL_OPTIONS.find(m => m.id === modelPref);
  const selectedType: VideoModelTypeFilter = selectedModelForRefs
    ? getVideoModelType(selectedModelForRefs)
    : typeFilter !== 'all' ? typeFilter : 'image-to-video';

  const loadHistory = useCallback(async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/generations?projectId=${activeProject.id}&type=video`);
    const data = await res.json();
    if (Array.isArray(data)) setHistory(data);
  }, [activeProject]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  const fetchPricingRef = useRef(0);
  function computeCost(up: { amount: number; unit: string }, dur: number): GenerationCost {
    if (up.unit === 'seconds') {
      return { amount: up.amount * dur, currency: 'USD', details: `${dur} seconds × $${up.amount.toFixed(3)}/sec` };
    }
    return { amount: up.amount, currency: 'USD', details: up.unit ? `per ${up.unit}` : '' };
  }

  async function fetchPricing(modelId: string, dur?: number) {
    if (!user?.hasFalKey || !modelId || modelId === 'auto' || modelId.startsWith('group:')) {
      setDynamicCost(null);
      setUnitPrice(null);
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
        const up = { amount: data.amount, unit: (data.details || '').replace('per ', '') };
        setUnitPrice(up);
        setDynamicCost(computeCost(up, dur ?? editDuration));
      } else {
        setUnitPrice(null);
        setDynamicCost(null);
      }
    } catch {
      if (callId === fetchPricingRef.current) { setDynamicCost(null); setUnitPrice(null); }
    } finally {
      if (callId === fetchPricingRef.current) setPricingLoading(false);
    }
  }

  function handleTypeFilterChange(newFilter: VideoModelTypeFilter) {
    setTypeFilter(newFilter);
    if (!isVideoModelGroupId(modelPref)) {
      const available = filterVideoModelsByType(newFilter);
      if (!available.find(m => m.id === modelPref)) {
        setModelPref('auto');
      }
    }
  }

  function buildBody(): Record<string, unknown> {
    const body: Record<string, unknown> = {
      instruction: instruction.trim(),
      model: modelPref === 'auto' ? undefined : modelPref,
      duration: desiredDuration,
      aspectRatio,
      quality,
      fps,
      strategy,
      systemPrompt: user?.systemPrompt || DEFAULT_SYSTEM_PROMPT,
    };
    if (sourceImage) body.sourceImage = sourceImage;
    if (sourceVideo) body.sourceVideo = sourceVideo.url;
    if (audioRef) body.audioUrl = audioRef.url;
    if (endImage) body.endImage = endImage;
    if (multiRefs.length > 0) body.referenceImages = multiRefs.map(r => r.url);
    return body;
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

  useEffect(() => {
    if (unitPrice) setDynamicCost(computeCost(unitPrice, editDuration));
  }, [editDuration]);

  const prevJobStepRef = useRef<Step>('input');
  useEffect(() => {
    if (jobStep === 'review' && prevJobStepRef.current !== 'review') {
      setViewStep('review');
    }
    prevJobStepRef.current = jobStep;
  }, [jobStep]);

  async function handlePrepare() {
    if (!instruction.trim() || !activeProject) return;
    setError('');
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeProject.id,
          type: 'video',
          ...buildBody(),
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
        body: JSON.stringify({
          prompt: editPrompt.trim(),
          model: editModel,
          params: {
            aspectRatio: editAspectRatio,
            quality: editQuality,
            fps: editFps,
            duration: editDuration,
          },
        }),
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
    if (gen.params.duration) setDesiredDuration(gen.params.duration as number);
    if (gen.params.typeFilter) setTypeFilter(gen.params.typeFilter as VideoModelTypeFilter);
    if (gen.params.aspectRatio) setAspectRatio(gen.params.aspectRatio as string);
    if (gen.params.quality) setQuality(gen.params.quality as string);
    if (gen.params.fps) setFps(gen.params.fps as number);
    if (gen.params.strategy) setStrategy(gen.params.strategy as string);
    setModelPref(gen.modelId);
    setSourceImage((gen.params.sourceImage as string) || '');
    setSourceVideo(gen.params.sourceVideo ? { url: gen.params.sourceVideo as string, type: 'video', name: 'Source video' } : null);
    setAudioRef(gen.params.audioUrl ? { url: gen.params.audioUrl as string, type: 'audio', name: 'Audio' } : null);
    setEndImage((gen.params.endImage as string) || '');
    const refImgs = gen.params.referenceImages as string[] | undefined;
    setMultiRefs(refImgs ? refImgs.map((url, i) => ({ url, type: 'image' as const, name: `Reference ${i + 1}` })) : []);
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
      <div className="flex items-center gap-3 flex-wrap mb-1">
        <h2 className="text-xl font-semibold">Generate Video</h2>
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
          {(selectedType as string) !== 'text-to-video' && (
            <div className="space-y-3 p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
              <p className="text-sm font-medium" style={{ color: 'var(--text1)' }}>References</p>

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

              {(selectedType === 'image-to-video' || selectedType === 'avatar' || selectedType === 'motion-control' || selectedType === 'start-end-frame') && (
                <ImagePicker value={sourceImage} onChange={setSourceImage} label="Source Image" refNumber={1} />
              )}

              {selectedType === 'start-end-frame' && (
                <ImagePicker value={endImage} onChange={setEndImage} label="End Image (optional)" refNumber={2} />
              )}

              {selectedType === 'multi-reference' && (
                <ReferenceUpload
                  references={multiRefs}
                  onChange={setMultiRefs}
                  accept="image/*"
                  label="Reference Images (2+)"
                />
              )}

              {(selectedType === 'video-edit' || selectedType === 'utility' || selectedType === 'lip-sync' || selectedType === 'motion-control') && (
                <ReferenceUpload
                  references={sourceVideo ? [sourceVideo] : []}
                  onChange={refs => setSourceVideo(refs[0] || null)}
                  accept="video/*"
                  label={selectedType === 'motion-control' ? 'Motion Reference Video' : 'Source Video'}
                />
              )}

              {(selectedType === 'avatar' || selectedType === 'lip-sync') && (
                <ReferenceUpload
                  references={audioRef ? [audioRef] : []}
                  onChange={refs => setAudioRef(refs[0] || null)}
                  accept="audio/*"
                  label="Audio File"
                />
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select value={modelPref} onChange={e => setModelPref(e.target.value)} className="w-full">
                <option value="auto">Auto (agent selects)</option>
                <optgroup label="By Group">
                  {VIDEO_MODEL_GROUPS.map(g => (
                    <option key={g.id} value={`group:${g.id}`}>{g.label} ({g.modelIds.length})</option>
                  ))}
                </optgroup>
                <optgroup label="Specific Model">
                  {filteredModels.map(m => (
                    <option key={m.id} value={m.id}>{m.label}</option>
                  ))}
                </optgroup>
              </select>
            </div>
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
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration</label>
              <select value={desiredDuration} onChange={e => setDesiredDuration(Number(e.target.value))} className="w-full">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Aspect Ratio</label>
              <select value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Quality</label>
              <select value={quality} onChange={e => setQuality(e.target.value)} className="w-full">
                {VIDEO_QUALITY_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>FPS</label>
              <select value={fps} onChange={e => setFps(Number(e.target.value))} className="w-full">
                {VIDEO_FPS_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Strategy</label>
            <div className="grid grid-cols-3 gap-2">
              {VIDEO_STRATEGY_OPTIONS.map(s => (
                <button
                  key={s.id}
                  onClick={() => setStrategy(s.id)}
                  className="py-2.5 rounded-lg text-sm font-medium transition-colors text-center"
                  style={{
                    background: strategy === s.id ? 'var(--accent)' : 'var(--bg-input)',
                    color: strategy === s.id ? 'white' : 'var(--text2)',
                    border: `1px solid ${strategy === s.id ? 'var(--accent)' : 'var(--border)'}`,
                  }}
                >
                  {s.label}
                  <span className="block text-[10px] mt-0.5" style={{ opacity: 0.7 }}>{s.description}</span>
                </button>
              ))}
            </div>
          </div>

          {sourceImage && sourceImageAR !== null && Math.abs(sourceImageAR - aspectRatioToNumeric(aspectRatio)) > 0.15 && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
              Source image aspect ratio ({sourceImageAR.toFixed(2)}) doesn&apos;t match video ({aspectRatio}). The image will be auto-adjusted before generation.
            </div>
          )}

          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Instruction</label>
            <textarea
              value={instruction}
              onChange={e => setInstruction(e.target.value)}
              placeholder="Describe what you want. E.g.: Animate the character with natural idle movement, subtle breathing. Use the uploaded image as the source..."
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

      {effectiveView === 'review' && job?.prepareResult && (() => {
        const displayCost = dynamicCost || (editModel === job.prepareResult.model ? job.prepareResult.estimatedCost : null);
        return (
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
              <select value={editModel} onChange={e => { setEditModel(e.target.value); fetchPricing(e.target.value); }} className="w-full">
                {filteredModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration</label>
              <select value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="w-full">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Aspect Ratio</label>
              <select value={editAspectRatio} onChange={e => setEditAspectRatio(e.target.value)} className="w-full">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Quality</label>
              <select value={editQuality} onChange={e => setEditQuality(e.target.value)} className="w-full">
                {VIDEO_QUALITY_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>FPS</label>
              <select value={editFps} onChange={e => setEditFps(Number(e.target.value))} className="w-full">
                {VIDEO_FPS_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
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
              Generate Video
            </button>
          </div>
        </div>
        );
      })()}

      {effectiveView === 'generating' && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text2)' }}>Generating video...</p>
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

      <VersionHistory generations={history} onSelect={handleSelectVersion} onDelete={handleDeleteVersion} />
    </div>
  );
}
