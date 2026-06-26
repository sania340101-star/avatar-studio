'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import {
  VIDEO_MODEL_OPTIONS,
  VIDEO_MODEL_GROUPS,
  VIDEO_MODEL_TYPE_FILTERS,
  filterVideoModelsByType,
  getVideoModelType,
  isVideoModelGroupId,
  getVideoModelIdsInGroup,
} from '@/lib/models';
import { getSessionUser } from '@/lib/auth';
import { useProject } from '@/lib/ProjectContext';
import { VideoModelTypeFilter, Generation, TemplateRef } from '@/lib/types';
import { useProjectCache } from '@/lib/useProjectCache';
import ImagePicker from '@/components/ImagePicker';
import ReferenceUpload from '@/components/ReferenceUpload';
import VersionHistory from '@/components/VersionHistory';

interface AgentResult {
  prompt: string;
  selectedModel: string;
  selectedModelLabel: string;
  params: { duration: number };
  reasoning: string;
  paramNotes?: string[];
}

type Step = 'input' | 'review' | 'generating';

export default function GenerateVideoPage() {
  const user = getSessionUser();
  const { activeProject } = useProject();

  // Step 1: User input
  const [typeFilter, setTypeFilter] = useState<VideoModelTypeFilter>('all');
  const [modelPref, setModelPref] = useState('auto');
  const [instruction, setInstruction] = useState('');
  const [desiredDuration, setDesiredDuration] = useState(5);
  const [sourceImage, setSourceImage] = useState('');
  const [sourceVideo, setSourceVideo] = useState<TemplateRef | null>(null);
  const [audioRef, setAudioRef] = useState<TemplateRef | null>(null);
  const [endImage, setEndImage] = useState('');
  const [multiRefs, setMultiRefs] = useState<TemplateRef[]>([]);

  // Step 2: Agent result (editable)
  const [agentResult, setAgentResult] = useState<AgentResult | null>(null);
  const [editPrompt, setEditPrompt] = useState('');
  const [editModel, setEditModel] = useState('');
  const [editDuration, setEditDuration] = useState(5);

  // State
  const [step, setStep] = useState<Step>('input');
  const [preparing, setPreparing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [results, setResults] = useState<{ url: string }[]>([]);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<Generation[]>([]);

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
    setSourceImage('');
    setSourceVideo(null);
    setAudioRef(null);
    setEndImage('');
    setMultiRefs([]);
    setAgentResult(null);
    setResults([]);
    setError('');
    setStep('input');
    cacheRestoredRef.current = false;
  }, [activeProject?.id]);

  useEffect(() => {
    if (!cacheRestoredRef.current) return;
    saveCache({
      instruction, modelPref, typeFilter, desiredDuration,
      sourceImage, sourceVideo, audioRef, endImage, multiRefs,
    });
  }, [instruction, modelPref, typeFilter, desiredDuration, sourceImage, sourceVideo, audioRef, endImage, multiRefs, saveCache]);

  const filteredModels = filterVideoModelsByType(typeFilter);

  // Determine selected model type for context-aware reference inputs
  const selectedModelForRefs = isVideoModelGroupId(modelPref)
    ? null
    : VIDEO_MODEL_OPTIONS.find(m => m.id === modelPref);
  const selectedType: VideoModelTypeFilter = selectedModelForRefs
    ? getVideoModelType(selectedModelForRefs)
    : typeFilter !== 'all' ? typeFilter : 'image-to-video';

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

  const loadHistory = useCallback(async () => {
    if (!activeProject) return;
    const res = await fetch(`/api/generations?projectId=${activeProject.id}&type=video`);
    const data = await res.json();
    if (Array.isArray(data)) setHistory(data);
  }, [activeProject]);

  useEffect(() => { loadHistory(); }, [loadHistory]);

  function handleTypeFilterChange(newFilter: VideoModelTypeFilter) {
    setTypeFilter(newFilter);
    // If current modelPref is a specific model that doesn't match the new filter, reset to auto
    if (!isVideoModelGroupId(modelPref)) {
      const available = filterVideoModelsByType(newFilter);
      if (!available.find(m => m.id === modelPref)) {
        setModelPref('auto');
      }
    }
  }

  function getAvailableModels() {
    // Start from filtered models by type, then narrow by model preference
    let models = filterVideoModelsByType(typeFilter);

    if (!isVideoModelGroupId(modelPref)) {
      // Specific model selected
      const specific = VIDEO_MODEL_OPTIONS.find(o => o.id === modelPref);
      if (specific) models = [specific];
    } else if (modelPref !== 'auto') {
      // Group selected — intersect with type-filtered
      const groupIds = getVideoModelIdsInGroup(modelPref);
      models = models.filter(m => groupIds.includes(m.id));
    }

    return models.map(m => {
      const groupId = VIDEO_MODEL_GROUPS.find(g => g.modelIds.includes(m.id))?.id ?? 'other';
      const type = getVideoModelType(m);
      const caps: string[] = [];
      if (m.avatarAudio) caps.push('avatar-audio');
      if (m.avatarText) caps.push('avatar-text');
      if (m.avatarVideoAudio) caps.push('lip-sync');
      if (m.motionControl) caps.push('motion-control');
      if (m.startEndFrame) caps.push('start-end-frame');
      if (m.multiRef) caps.push('multi-reference');
      if (m.videoEdit) caps.push('video-edit');
      if (m.utilityVideo) caps.push('utility');
      if (m.textToVideoOnly) caps.push('text-to-video');
      if (caps.length === 0) caps.push('image-to-video');
      return { id: m.id, label: m.label, type, group: groupId, capabilities: caps };
    });
  }

  function getReferenceDescriptions(): string[] {
    const descs: string[] = [];
    if (sourceImage) descs.push('Source image uploaded');
    if (endImage) descs.push('End image uploaded');
    if (sourceVideo) descs.push(`Source video: "${sourceVideo.name}"`);
    if (audioRef) descs.push(`Audio file: "${audioRef.name}"`);
    if (multiRefs.length > 0) descs.push(`${multiRefs.length} reference image(s) uploaded`);
    return descs;
  }

  async function handlePrepare() {
    if (!instruction.trim()) return;
    setPreparing(true);
    setError('');
    try {
      const res = await fetch('/api/prepare-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'video',
          instruction: instruction.trim(),
          referenceDescriptions: getReferenceDescriptions(),
          modelPreference: modelPref,
          desiredParams: { duration: desiredDuration, typeFilter },
          availableModels: getAvailableModels(),
          anthropicKey: user?.anthropicKey,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAgentResult(data);
      setEditPrompt(data.prompt);
      setEditModel(data.selectedModel);
      setEditDuration(data.params?.duration || desiredDuration);
      setStep('review');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to prepare generation');
    } finally {
      setPreparing(false);
    }
  }

  async function handleGenerate() {
    if (!editPrompt.trim() || !activeProject) return;
    setGenerating(true);
    setStep('generating');
    setError('');
    try {
      const genBody: Record<string, unknown> = {
        type: 'video',
        model: editModel,
        prompt: editPrompt.trim(),
        duration: editDuration,
        falKey: user?.falKey,
      };
      if (sourceImage) genBody.sourceImage = sourceImage;
      if (sourceVideo) genBody.sourceVideo = sourceVideo.url;
      if (audioRef) genBody.audioUrl = audioRef.url;
      if (endImage) genBody.endImage = endImage;
      if (multiRefs.length > 0) genBody.referenceImages = multiRefs.map(r => r.url);

      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(genBody),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      if (data.video) {
        setResults(prev => [data.video, ...prev]);

        const modelOpt = VIDEO_MODEL_OPTIONS.find(m => m.id === editModel);
        const allRefUrls = [
          ...(sourceImage ? [sourceImage] : []),
          ...(sourceVideo ? [sourceVideo.url] : []),
          ...(audioRef ? [audioRef.url] : []),
          ...(endImage ? [endImage] : []),
          ...multiRefs.map(r => r.url),
        ];
        await fetch('/api/generations', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            projectId: activeProject.id,
            userId: user?.userId,
            type: 'video',
            modelId: editModel,
            modelLabel: modelOpt?.label || editModel,
            prompt: editPrompt.trim(),
            params: {
              duration: editDuration, typeFilter,
              instruction: instruction.trim(),
              agentReasoning: agentResult?.reasoning,
              sourceImage: sourceImage || undefined,
              sourceVideo: sourceVideo?.url,
              audioUrl: audioRef?.url,
              endImage: endImage || undefined,
              referenceImages: multiRefs.length > 0 ? multiRefs.map(r => r.url) : undefined,
            },
            referenceUrls: allRefUrls,
            resultUrls: [data.video.url],
            status: 'completed',
          }),
        });
        loadHistory();
        setStep('input');
      }
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setStep('review');
    } finally {
      setGenerating(false);
    }
  }

  function handleBack() {
    setStep('input');
    setAgentResult(null);
  }

  function handleSelectVersion(gen: Generation) {
    setEditModel(gen.modelId);
    setEditPrompt(gen.prompt);
    if (gen.params.instruction) setInstruction(gen.params.instruction as string);
    if (gen.params.duration) {
      setDesiredDuration(gen.params.duration as number);
      setEditDuration(gen.params.duration as number);
    }
    if (gen.params.typeFilter) setTypeFilter(gen.params.typeFilter as VideoModelTypeFilter);
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
      <h2 className="text-xl font-semibold mb-1">Generate Video</h2>
      <p className="text-sm mb-6" style={{ color: 'var(--text3)' }}>Project: {activeProject.title}</p>

      {step === 'input' && (
        <div className="space-y-5">
          {/* Context-aware reference inputs */}
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
                <ImagePicker value={sourceImage} onChange={setSourceImage} label="Source Image" />
              )}

              {selectedType === 'start-end-frame' && (
                <ImagePicker value={endImage} onChange={setEndImage} label="End Image (optional)" />
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

          {/* Model preference + Type filter */}
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

          {/* Duration */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Duration (seconds)</label>
            <select value={desiredDuration} onChange={e => setDesiredDuration(Number(e.target.value))} className="w-full" style={{ maxWidth: '200px' }}>
              {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                <option key={d} value={d}>{d}s</option>
              ))}
            </select>
          </div>

          {/* Instruction */}
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

          {/* Prepare button */}
          <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <p className="text-xs" style={{ color: 'var(--text3)' }}>
              Agent will generate prompt and select optimal parameters
            </p>
            <button
              onClick={handlePrepare}
              disabled={preparing || !instruction.trim() || !user?.anthropicKey}
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

          {!user?.anthropicKey && (
            <div className="p-3 rounded-lg text-sm" style={{ background: 'var(--accent-subtle)', color: 'var(--accent)' }}>
              Add your Anthropic API key in Settings to enable the AI agent.
            </div>
          )}
        </div>
      )}

      {step === 'review' && agentResult && (
        <div className="space-y-5">
          <button onClick={handleBack} className="text-sm" style={{ color: 'var(--text3)' }}>
            &larr; Back to instruction
          </button>

          {/* Agent reasoning */}
          <div className="p-4 rounded-xl" style={{ background: 'rgba(76,175,80,0.08)', border: '1px solid rgba(76,175,80,0.2)' }}>
            <p className="text-xs font-medium mb-1" style={{ color: 'var(--green)' }}>Agent Reasoning</p>
            <p className="text-sm" style={{ color: 'var(--text2)' }}>{agentResult.reasoning}</p>
          </div>

          {/* Param notes (differences) */}
          {agentResult.paramNotes && agentResult.paramNotes.length > 0 && (
            <div className="p-3 rounded-lg" style={{ background: 'rgba(255,193,7,0.08)', border: '1px solid rgba(255,193,7,0.2)' }}>
              <p className="text-xs font-medium mb-1" style={{ color: '#ffc107' }}>Parameter Adjustments</p>
              {agentResult.paramNotes.map((note, i) => (
                <p key={i} className="text-sm" style={{ color: 'var(--text2)' }}>{note}</p>
              ))}
            </div>
          )}

          {/* Editable prompt */}
          <div>
            <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>Generated Prompt <span className="text-xs" style={{ color: 'var(--text3)' }}>(editable)</span></label>
            <textarea
              value={editPrompt}
              onChange={e => setEditPrompt(e.target.value)}
              className="w-full h-36 resize-none"
            />
          </div>

          {/* Editable model + duration */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>
                Model
                {isVideoModelGroupId(modelPref) && (
                  <span className="text-xs ml-1" style={{ color: 'var(--green)' }}>(agent selected)</span>
                )}
              </label>
              <select value={editModel} onChange={e => setEditModel(e.target.value)} className="w-full">
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
            <div>
              <label className="block text-sm mb-1.5" style={{ color: 'var(--text2)' }}>
                Duration
                {editDuration !== desiredDuration && <span className="text-xs ml-1" style={{ color: '#ffc107' }}>(adjusted)</span>}
              </label>
              <select value={editDuration} onChange={e => setEditDuration(Number(e.target.value))} className="w-full">
                {[3, 4, 5, 6, 7, 8, 10, 12, 15, 20].map(d => (
                  <option key={d} value={d}>{d}s</option>
                ))}
              </select>
            </div>
          </div>

          {/* References preview */}
          {(sourceImage || endImage || sourceVideo || audioRef || multiRefs.length > 0) && (
            <div className="flex gap-2 flex-wrap items-center">
              {sourceImage && (
                <div className="relative w-12 h-12 rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <span className="absolute top-0 left-0 z-10 w-full bg-black/60 text-[8px] text-white px-0.5 truncate">src</span>
                  <img src={sourceImage} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {endImage && (
                <div className="relative w-12 h-12 rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <span className="absolute top-0 left-0 z-10 w-full bg-black/60 text-[8px] text-white px-0.5 truncate">end</span>
                  <img src={endImage} alt="" className="w-full h-full object-cover" />
                </div>
              )}
              {multiRefs.map((ref, i) => (
                <div key={i} className="relative w-12 h-12 rounded overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                  <span className="absolute top-0 left-0 z-10 w-4 h-4 flex items-center justify-center text-[10px] font-bold" style={{ background: 'var(--accent)', color: 'white' }}>{i + 1}</span>
                  <img src={ref.url} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
              {sourceVideo && (
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3" style={{ color: 'var(--accent)' }}>
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  {sourceVideo.name}
                </div>
              )}
              {audioRef && (
                <div className="flex items-center gap-1 px-2 py-1 rounded text-xs" style={{ background: 'var(--bg-input)', border: '1px solid var(--border)', color: 'var(--text2)' }}>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3 h-3" style={{ color: 'var(--green)' }}>
                    <path d="M9 18V5l12-2v13" /><circle cx="6" cy="18" r="3" /><circle cx="18" cy="16" r="3" />
                  </svg>
                  {audioRef.name}
                </div>
              )}
            </div>
          )}

          {/* Generate button */}
          <div className="flex flex-col-reverse sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
            <span className="text-sm" style={{ color: 'var(--text3)' }}>
              ~$0.10 estimated
            </span>
            <button
              onClick={handleGenerate}
              disabled={generating || !editPrompt.trim()}
              className="w-full sm:w-auto px-6 py-2.5 rounded-lg text-sm font-semibold text-white disabled:opacity-50"
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
        </div>
      )}

      {step === 'generating' && (
        <div className="text-center py-16">
          <div className="w-10 h-10 border-2 rounded-full animate-spin mx-auto mb-4" style={{ borderColor: 'var(--border)', borderTopColor: 'var(--accent)' }} />
          <p style={{ color: 'var(--text2)' }}>Generating video...</p>
          <p className="text-sm mt-1" style={{ color: 'var(--text3)' }}>{VIDEO_MODEL_OPTIONS.find(m => m.id === editModel)?.label}</p>
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
