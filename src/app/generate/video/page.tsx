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
import { VideoModelTypeFilter, Generation, GenerationCost, TemplateRef, JobData, Template, PoseMatrix } from '@/lib/types';
import { useProjectCache } from '@/lib/useProjectCache';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';
import BatchRunner from '@/components/BatchRunner';
import ShareDialog from '@/components/ShareDialog';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/constants';
import VersionHistory from '@/components/VersionHistory';
import StepBar from '@/components/StepBar';

type Step = 'input' | 'review' | 'generating';

function PoseMatrixRunner({ matrix, projectId, poseImages, setPoseImages, batchId, setBatchId, batchJobs, setBatchJobs, generating, setGenerating, error, setError, savedRef, onComplete }: {
  matrix: PoseMatrix;
  projectId: string;
  poseImages: Record<string, string>;
  setPoseImages: (v: Record<string, string>) => void;
  batchId: string | null;
  setBatchId: (v: string | null) => void;
  batchJobs: JobData[];
  setBatchJobs: (v: JobData[] | ((prev: JobData[]) => JobData[])) => void;
  generating: boolean;
  setGenerating: (v: boolean) => void;
  error: string;
  setError: (v: string) => void;
  savedRef: React.MutableRefObject<string | null>;
  onComplete?: () => void;
}) {
  const allPosesHaveImages = matrix.poses.every(p => poseImages[p.id]);
  const poseMap = new Map(matrix.poses.map(p => [p.id, p]));
  const completedJobs = batchJobs.filter(j => j.status === 'complete');
  const errorJobs = batchJobs.filter(j => j.status === 'error');
  const runningJobs = batchJobs.filter(j => j.status !== 'complete' && j.status !== 'error');

  useEffect(() => {
    if (!batchId) return;
    const allDone = batchJobs.length > 0 && batchJobs.every(j => j.status === 'complete' || j.status === 'error');
    if (allDone) return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/jobs/batch?batchId=${batchId}`);
        if (res.ok) {
          const data = await res.json();
          if (Array.isArray(data.jobs)) setBatchJobs(data.jobs);
        }
      } catch {}
    }, 2000);
    return () => clearInterval(interval);
  }, [batchId, batchJobs, setBatchJobs]);

  useEffect(() => {
    if (!batchId || savedRef.current === batchId) return;
    const allDone = batchJobs.length > 0 && batchJobs.every(j => j.status === 'complete' || j.status === 'error');
    if (!allDone) return;
    savedRef.current = batchId;
    const pm = new Map(matrix.poses.map(p => [p.id, p]));
    const completed = batchJobs.filter(j => j.status === 'complete' && j.result?.video?.url);
    const saves = completed.map(job => {
      const clip = matrix.clips[job.slotIndex ?? 0];
      const startPose = clip ? pm.get(clip.startPoseId) : null;
      const endPose = clip ? pm.get(clip.endPoseId) : null;
      return fetch('/api/generations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId,
          type: 'video',
          modelId: job.result?.model || matrix.modelId,
          modelLabel: job.result?.modelLabel || matrix.modelLabel,
          prompt: job.result?.prompt || clip?.prompt || '',
          params: {
            poseMatrixId: matrix.id,
            poseMatrixName: matrix.name,
            slotIndex: job.slotIndex,
            instruction: clip?.prompt || '',
            startPose: startPose?.name,
            endPose: endPose?.name,
            clipType: clip?.startPoseId === clip?.endPoseId ? 'loop' : 'transition',
            duration: matrix.duration,
            aspectRatio: matrix.aspectRatio,
            quality: matrix.quality,
            fps: matrix.fps,
          },
          referenceUrls: [poseImages[clip?.startPoseId || ''], poseImages[clip?.endPoseId || '']].filter(Boolean),
          resultUrls: job.result?.video?.url ? [job.result.video.url] : [],
          status: 'completed',
          actualCost: job.result?.cost || undefined,
          batchId,
        }),
      }).catch(e => console.error('Failed to save pose matrix result:', e));
    });
    Promise.all(saves).then(() => onComplete?.());
  }, [batchId, batchJobs, projectId, matrix, poseImages, savedRef, onComplete]);

  async function handleGenerate() {
    setGenerating(true);
    setError('');
    setBatchId(null);
    setBatchJobs([]);
    try {
      const res = await fetch(`/api/pose-matrix/${matrix.id}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, poseImages }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBatchId(data.batchId);
      setBatchJobs(data.jobs || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="space-y-4">
      {/* Pose image slots */}
      <div className="p-4 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
        <p className="text-sm font-medium mb-3">Pose Images ({Object.keys(poseImages).filter(k => poseImages[k]).length}/{matrix.poses.length})</p>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {matrix.poses.map((pose, i) => (
            <div key={pose.id} className="rounded-lg p-2" style={{ border: '1px solid var(--border)' }}>
              <div className="flex items-center gap-1 mb-2">
                <span className="text-xs font-bold w-5 text-center" style={{ color: 'var(--accent)' }}>{i + 1}</span>
                <span className="text-xs font-medium" style={{ color: 'var(--text1)' }}>{pose.name}</span>
              </div>
              <ImagePicker value={poseImages[pose.id] || ''} onChange={url => setPoseImages({ ...poseImages, [pose.id]: url })} label="" />
            </div>
          ))}
        </div>
      </div>

      {/* Matrix info */}
      <div className="flex flex-wrap gap-2 text-xs" style={{ color: 'var(--text3)' }}>
        <span className="px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>{matrix.modelLabel}</span>
        <span className="px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>{matrix.duration}s</span>
        <span className="px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>{matrix.aspectRatio}</span>
        <span className="px-2 py-1 rounded" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>{matrix.clips.length} clips</span>
      </div>

      {error && (
        <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(239,68,68,0.1)', color: 'var(--red)', border: '1px solid rgba(239,68,68,0.2)' }}>
          {error}
        </div>
      )}

      {/* Generate button */}
      {!batchId && (
        <button onClick={handleGenerate} disabled={generating || !allPosesHaveImages || matrix.clips.length === 0}
          className="w-full py-3 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
          style={{ background: generating ? 'var(--text3)' : 'var(--accent)' }}>
          {generating ? 'Starting...' : `Generate ${matrix.clips.length} Clip${matrix.clips.length !== 1 ? 's' : ''}`}
        </button>
      )}

      {/* Batch progress */}
      {batchId && (
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>
              Progress: {completedJobs.length}/{batchJobs.length} complete
              {errorJobs.length > 0 && `, ${errorJobs.length} failed`}
            </span>
            {runningJobs.length > 0 && (
              <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
            )}
          </div>

          <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: 'var(--border)' }}>
            <div className="h-full rounded-full transition-all duration-500"
              style={{ width: `${batchJobs.length > 0 ? (completedJobs.length / batchJobs.length) * 100 : 0}%`, background: errorJobs.length > 0 ? '#f59e0b' : 'var(--accent)' }} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {batchJobs.map((job, i) => {
              const clip = matrix.clips[job.slotIndex ?? i];
              const startPose = clip ? poseMap.get(clip.startPoseId) : null;
              const endPose = clip ? poseMap.get(clip.endPoseId) : null;
              const isLoop = clip?.startPoseId === clip?.endPoseId;
              return (
                <div key={job.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--border)', background: 'var(--bg-card)' }}>
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-xs font-medium px-1.5 py-0.5 rounded" style={{
                      background: isLoop ? 'var(--accent-subtle)' : 'rgba(76,175,80,0.15)',
                      color: isLoop ? 'var(--accent)' : 'var(--green)',
                    }}>
                      {startPose?.name || '?'} → {endPose?.name || '?'}
                    </span>
                    <span className="text-xs truncate flex-1" style={{ color: 'var(--text3)' }}>{clip?.prompt || ''}</span>
                    <span className="text-xs px-2 py-0.5 rounded font-medium shrink-0" style={{
                      background: job.status === 'complete' ? 'rgba(76,175,80,0.15)' : job.status === 'error' ? 'rgba(239,68,68,0.15)' : 'rgba(108,60,224,0.1)',
                      color: job.status === 'complete' ? 'var(--green)' : job.status === 'error' ? 'var(--red)' : 'var(--accent)',
                    }}>
                      {job.status === 'complete' ? 'Done' : job.status === 'error' ? 'Failed' : job.status === 'recovering' ? 'Recovering...' : 'Generating...'}
                    </span>
                  </div>

                  {job.status === 'complete' && job.result?.video?.url && (
                    <div className="rounded-lg overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                      <video src={job.result.video.url} className="w-full" controls />
                    </div>
                  )}

                  {job.status === 'error' && (
                    <div>
                      <p className="text-xs mb-2" style={{ color: 'var(--red)' }}>{job.error || 'Unknown error'}</p>
                      <div className="flex gap-2">
                        <button onClick={async () => {
                          try {
                            const res = await fetch(`/api/jobs/${job.id}/retry`, { method: 'POST' });
                            if (res.ok) setBatchJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'generating', error: undefined } : j));
                          } catch {}
                        }} className="px-3 py-1 rounded text-xs font-medium text-white" style={{ background: 'var(--accent)' }}>Retry</button>
                        {!!job.input._falRequestId && (
                          <button onClick={async () => {
                            try {
                              setBatchJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'recovering' as JobData['status'], error: undefined } : j));
                              const res = await fetch(`/api/jobs/${job.id}/recover`, { method: 'POST' });
                              if (!res.ok) {
                                const data = await res.json();
                                setBatchJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: 'error' as JobData['status'], error: data.error || 'Recovery failed' } : j));
                              }
                            } catch {}
                          }} className="px-3 py-1 rounded text-xs font-medium" style={{ background: 'rgba(76,175,80,0.15)', color: 'var(--green)' }}>Recover</button>
                        )}
                      </div>
                    </div>
                  )}

                  {job.status !== 'complete' && job.status !== 'error' && (
                    <div className="flex items-center justify-center py-6">
                      <span className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
                    </div>
                  )}

                  {job.result?.cost?.amount != null && (
                    <div className="mt-2 text-xs text-right" style={{ color: 'var(--text3)' }}>${job.result.cost.amount.toFixed(3)}</div>
                  )}
                </div>
              );
            })}
          </div>

          {runningJobs.length === 0 && batchJobs.length > 0 && (
            <button onClick={() => { setBatchId(null); setBatchJobs([]); savedRef.current = null; }}
              className="w-full py-2.5 rounded-lg text-sm font-medium" style={{ border: '1px solid var(--border)', color: 'var(--text2)' }}>
              Run Again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

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

  // Template mode
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<Template | null>(null);

  // Pose Matrix mode
  const [poseMatrices, setPoseMatrices] = useState<PoseMatrix[]>([]);
  const [selectedMatrix, setSelectedMatrix] = useState<PoseMatrix | null>(null);
  const [poseImages, setPoseImages] = useState<Record<string, string>>({});
  const [matrixBatchId, setMatrixBatchId] = useState<string | null>(null);
  const [matrixBatchJobs, setMatrixBatchJobs] = useState<JobData[]>([]);
  const [matrixGenerating, setMatrixGenerating] = useState(false);
  const [matrixError, setMatrixError] = useState('');
  const matrixSavedRef = useRef<string | null>(null);
  const [shareMatrix, setShareMatrix] = useState<{ id: string; name: string } | null>(null);

  // Generation mode
  type GenMode = 'manual' | 'template' | 'pose-matrix';
  const [genMode, setGenMode] = useState<GenMode>('manual');

  useEffect(() => {
    fetch('/api/templates').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setTemplates(data.filter((t: Template) => t.slots?.length > 0));
    }).catch(() => {});
    fetch('/api/pose-matrix').then(r => r.json()).then(data => {
      if (Array.isArray(data)) setPoseMatrices(data.filter((m: PoseMatrix) => m.clips?.length > 0));
    }).catch(() => {});
  }, []);

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
      }).then(() => loadHistory()).catch(e => console.error('Failed to save to version history:', e));
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

      {/* Mode selector — top of page */}
      {(templates.length > 0 || poseMatrices.length > 0) && (
        <div className="mb-4 mt-3 p-3 rounded-xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-sm font-medium" style={{ color: 'var(--text2)' }}>Mode:</span>
            <div className="flex gap-1">
              {(['manual', 'template', 'pose-matrix'] as GenMode[]).map(mode => {
                if (mode === 'template' && templates.length === 0) return null;
                if (mode === 'pose-matrix' && poseMatrices.length === 0) return null;
                return (
                  <button key={mode} onClick={() => {
                    setGenMode(mode);
                    if (mode !== 'template') setSelectedTemplate(null);
                    if (mode !== 'pose-matrix') { setSelectedMatrix(null); setPoseImages({}); setMatrixBatchId(null); setMatrixBatchJobs([]); }
                  }} className="px-3 py-1 rounded text-xs font-medium transition-colors" style={{
                    background: genMode === mode ? 'var(--accent)' : 'transparent',
                    color: genMode === mode ? 'white' : 'var(--text3)',
                    border: genMode === mode ? 'none' : '1px solid var(--border)',
                  }}>
                    {mode === 'manual' ? 'Manual' : mode === 'template' ? 'Template' : 'Pose Matrix'}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Template selector */}
          {genMode === 'template' && (
            <select
              value={selectedTemplate?.id || ''}
              onChange={e => {
                if (!e.target.value) { setSelectedTemplate(null); return; }
                const tmpl = templates.find(t => t.id === e.target.value);
                if (tmpl) setSelectedTemplate(tmpl);
              }}
              className="w-full text-sm"
            >
              <option value="">Select a template...</option>
              {templates.map(t => (
                <option key={t.id} value={t.id}>
                  {t.name} — {t.slots.length} slot{t.slots.length !== 1 ? 's' : ''}
                </option>
              ))}
            </select>
          )}

          {/* Pose Matrix selector */}
          {genMode === 'pose-matrix' && (
            <div className="flex gap-2 items-center">
              <select
                value={selectedMatrix?.id || ''}
                onChange={e => {
                  if (!e.target.value) { setSelectedMatrix(null); setPoseImages({}); return; }
                  const m = poseMatrices.find(pm => pm.id === e.target.value);
                  if (m) { setSelectedMatrix(m); setPoseImages({}); setMatrixBatchId(null); setMatrixBatchJobs([]); setMatrixError(''); }
                }}
                className="flex-1 text-sm"
              >
                <option value="">Select a pose matrix template...</option>
                {poseMatrices.map(m => (
                  <option key={m.id} value={m.id}>
                    {m.name} — {m.poses.length} poses · {m.clips.length} clips · {m.modelLabel}
                  </option>
                ))}
              </select>
              {selectedMatrix && (
                <button
                  onClick={() => setShareMatrix({ id: selectedMatrix.id, name: selectedMatrix.name })}
                  className="w-8 h-8 rounded-lg flex items-center justify-center opacity-50 hover:opacity-100 flex-shrink-0"
                  style={{ color: 'var(--text3)' }}
                  title="Share"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><line x1="8.59" y1="13.51" x2="15.42" y2="17.49" /><line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {/* References — hidden in pose-matrix mode (poses ARE the references) */}
      {genMode !== 'pose-matrix' && (
        <div className="space-y-3 p-4 rounded-xl mb-4" style={{ background: 'var(--bg-card)', border: '1px solid var(--border)' }}>
          <p className="text-sm font-medium" style={{ color: 'var(--text1)' }}>References</p>

          {!selectedTemplate && (selectedType as string) !== 'text-to-video' && (
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

          {selectedTemplate && (
            <div className="p-2 rounded-lg text-xs" style={{ background: 'var(--accent-subtle)', color: 'var(--text2)' }}>
              Shared references for all {selectedTemplate.slots.length} slot{selectedTemplate.slots.length !== 1 ? 's' : ''} in template
            </div>
          )}

          <ImagePicker value={sourceImage} onChange={setSourceImage} label="Source Image" refNumber={1} />
          <ImagePicker value={endImage} onChange={setEndImage} label="End Image (optional)" refNumber={2} />

          <ReferenceUpload
            references={sourceVideo ? [sourceVideo] : []}
            onChange={refs => setSourceVideo(refs[0] || null)}
            accept="video/*"
            label="Source Video (optional)"
          />

          <ReferenceUpload
            references={audioRef ? [audioRef] : []}
            onChange={refs => setAudioRef(refs[0] || null)}
            accept="audio/*"
            label="Audio File (optional)"
          />

          {!selectedTemplate && selectedType === 'multi-reference' && (
            <ReferenceUpload
              references={multiRefs}
              onChange={setMultiRefs}
              accept="image/*"
              label="Reference Images (2+)"
            />
          )}
        </div>
      )}

      {/* Template mode — inline BatchRunner */}
      {genMode === 'template' && selectedTemplate && (
        <BatchRunner
          template={selectedTemplate}
          projectId={activeProject.id}
          onBack={() => setSelectedTemplate(null)}
          inline
          externalRefs={{ sourceImage, sourceVideo, audioRef, endImage }}
          onComplete={loadHistory}
        />
      )}

      {/* Pose Matrix mode */}
      {genMode === 'pose-matrix' && selectedMatrix && (
        <PoseMatrixRunner
          matrix={selectedMatrix}
          projectId={activeProject.id}
          poseImages={poseImages}
          setPoseImages={setPoseImages}
          batchId={matrixBatchId}
          setBatchId={setMatrixBatchId}
          batchJobs={matrixBatchJobs}
          setBatchJobs={setMatrixBatchJobs}
          generating={matrixGenerating}
          setGenerating={setMatrixGenerating}
          error={matrixError}
          setError={setMatrixError}
          savedRef={matrixSavedRef}
          onComplete={loadHistory}
        />
      )}

      {/* Manual mode */}
      {genMode === 'manual' && (
        <>
      <StepBar
        current={effectiveView}
        hasPrepared={hasPrepared}
        isPreparing={isPreparing}
        onStepClick={setViewStep}
      />

      {effectiveView === 'input' && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="select-model" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select id="select-model" value={modelPref} onChange={e => setModelPref(e.target.value)} className="w-full">
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
              <label htmlFor="select-type-filter" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Type Filter</label>
              <select
                id="select-type-filter"
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
              <label htmlFor="select-duration" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration</label>
              <select id="select-duration" value={desiredDuration} onChange={e => setDesiredDuration(Number(e.target.value))} className="w-full">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-aspect-ratio" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Aspect Ratio</label>
              <select id="select-aspect-ratio" value={aspectRatio} onChange={e => setAspectRatio(e.target.value)} className="w-full">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-quality" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Quality</label>
              <select id="select-quality" value={quality} onChange={e => setQuality(e.target.value)} className="w-full">
                {VIDEO_QUALITY_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-fps" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>FPS</label>
              <select id="select-fps" value={fps} onChange={e => setFps(Number(e.target.value))} className="w-full">
                {VIDEO_FPS_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {(modelPref === 'auto' || isVideoModelGroupId(modelPref)) && (
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
                    <span className="block text-xs mt-0.5" style={{ opacity: 0.7 }}>{s.description}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sourceImage && sourceImageAR !== null && Math.abs(sourceImageAR - aspectRatioToNumeric(aspectRatio)) > 0.15 && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.2)' }}>
              Source image aspect ratio ({sourceImageAR.toFixed(2)}) doesn&apos;t match video ({aspectRatio}). The image will be auto-adjusted before generation.
            </div>
          )}

          <div>
            <label htmlFor="input-instruction" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Instruction</label>
            <textarea
              id="input-instruction"
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
            <label htmlFor="input-prompt" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Prompt</label>
            <textarea
              id="input-prompt"
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              className="w-full h-40 resize-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor="select-review-model" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Model</label>
              <select id="select-review-model" value={editModel} onChange={e => { setEditModel(e.target.value); fetchPricing(e.target.value); }} className="w-full">
                {filteredModels.map(m => (
                  <option key={m.id} value={m.id}>{m.label}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <div>
              <label htmlFor="select-review-duration" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration</label>
              <select id="select-review-duration" value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="w-full">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-review-aspect-ratio" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Aspect Ratio</label>
              <select id="select-review-aspect-ratio" value={editAspectRatio} onChange={e => setEditAspectRatio(e.target.value)} className="w-full">
                {VIDEO_ASPECT_RATIO_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-review-quality" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Quality</label>
              <select id="select-review-quality" value={editQuality} onChange={e => setEditQuality(e.target.value)} className="w-full">
                {VIDEO_QUALITY_OPTIONS.map(o => (
                  <option key={o.id} value={o.id}>{o.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="select-review-fps" className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>FPS</label>
              <select id="select-review-fps" value={editFps} onChange={e => setEditFps(Number(e.target.value))} className="w-full">
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

        </>
      )}

      <VersionHistory generations={history} onSelect={handleSelectVersion} onDelete={handleDeleteVersion} />

      {shareMatrix && (
        <ShareDialog
          entityType="pose-matrix"
          entityId={shareMatrix.id}
          entityName={shareMatrix.name}
          onClose={() => setShareMatrix(null)}
        />
      )}
    </div>
  );
}
