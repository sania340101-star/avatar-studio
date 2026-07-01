import { ImageModelOption, VideoModelOption, VideoModelTypeFilter } from './types';

// ---------------------------------------------------------------------------
// Image Models (from fal.ai — full list)
// ---------------------------------------------------------------------------

export const IMAGE_MODEL_OPTIONS: ImageModelOption[] = [
  // Flux
  { id: 'fal-ai/flux/schnell', label: 'Flux Schnell (fast)', format: 'flux' },
  { id: 'fal-ai/flux/dev', label: 'Flux Dev (quality)', format: 'flux' },
  { id: 'fal-ai/flux-pro', label: 'Flux Pro', format: 'flux' },
  { id: 'fal-ai/flux-pro/v1.1', label: 'Flux Pro v1.1', format: 'flux' },
  { id: 'fal-ai/flux-2-flex', label: 'Flux 2 Flex', format: 'flux' },
  { id: 'fal-ai/flux-2-pro', label: 'Flux 2 Pro', format: 'flux' },
  { id: 'fal-ai/flux-2/edit', label: 'Flux 2 Edit', format: 'flux' },
  { id: 'fal-ai/flux-2-pro/edit', label: 'Flux 2 Pro Edit', format: 'flux' },
  { id: 'fal-ai/flux-general/image-to-image', label: 'Flux General (i2i)', format: 'flux' },
  { id: 'fal-ai/flux-realism', label: 'Flux Realism', format: 'flux' },
  { id: 'fal-ai/flux-pro/kontext', label: 'Flux Kontext (pro)', format: 'flux' },
  { id: 'fal-ai/flux-kontext-lora', label: 'Flux Kontext LoRA', format: 'flux' },
  { id: 'fal-ai/flux-krea-lora/stream', label: 'Flux Krea LoRA Stream', format: 'flux' },
  // Nano Banana
  { id: 'fal-ai/nano-banana', label: 'Nano Banana', format: 'aspect_ratio' },
  { id: 'fal-ai/nano-banana/edit', label: 'Nano Banana Edit', format: 'aspect_ratio' },
  { id: 'fal-ai/nano-banana-pro', label: 'Nano Banana Pro', format: 'aspect_ratio' },
  { id: 'fal-ai/nano-banana-pro/edit', label: 'Nano Banana Pro Edit', format: 'aspect_ratio' },
  { id: 'fal-ai/nano-banana-2', label: 'Nano Banana 2', format: 'aspect_ratio' },
  { id: 'fal-ai/nano-banana-2/edit', label: 'Nano Banana 2 Edit', format: 'aspect_ratio' },
  // Recraft
  { id: 'fal-ai/recraft/v3/text-to-image', label: 'Recraft V3', format: 'aspect_ratio' },
  { id: 'fal-ai/recraft/v4/pro/text-to-image', label: 'Recraft V4 Pro', format: 'aspect_ratio' },
  // Qwen Image
  { id: 'fal-ai/qwen-image-2/text-to-image', label: 'Qwen Image 2.0', format: 'aspect_ratio' },
  { id: 'fal-ai/qwen-image-2/pro/text-to-image', label: 'Qwen Image 2.0 Pro', format: 'aspect_ratio' },
  { id: 'fal-ai/qwen-image-2/edit', label: 'Qwen Image 2.0 Edit', format: 'aspect_ratio' },
  { id: 'fal-ai/qwen-image-2/pro/edit', label: 'Qwen Image 2.0 Pro Edit', format: 'aspect_ratio' },
  // Seedream
  { id: 'fal-ai/bytedance/seedream/v4.5/edit', label: 'Seedream 4.5 Edit', format: 'aspect_ratio' },
  { id: 'fal-ai/bytedance/seedream/v5/lite/edit', label: 'Seedream 5.0 Lite Edit', format: 'aspect_ratio' },
  { id: 'fal-ai/bytedance/seedream/v4/edit', label: 'Seedream 4.0 Edit', format: 'aspect_ratio' },
  // Bria
  { id: 'fal-ai/bria/fibo/generate', label: 'Bria Fibo Generate', format: 'aspect_ratio' },
  { id: 'bria/fibo-edit/edit', label: 'Bria Fibo Edit', format: 'aspect_ratio' },
  // Other
  { id: 'fal-ai/stable-diffusion-v35-large', label: 'SD 3.5 Large', format: 'aspect_ratio' },
  { id: 'xai/grok-imagine-image', label: 'Grok Imagine Image', format: 'aspect_ratio' },
  { id: 'fal-ai/gpt-image-1.5/edit', label: 'GPT Image 1.5 Edit', format: 'flux' },
  { id: 'fal-ai/physic-edit', label: 'Physic Edit', format: 'flux' },
  { id: 'fal-ai/onereward', label: 'OneReward', format: 'flux' },
  { id: 'fal-ai/firered-image-edit-v1.1', label: 'FireRed Image Edit v1.1', format: 'flux' },
  { id: 'fal-ai/reve/edit', label: 'Reve Edit', format: 'flux' },
  { id: 'imagineart/imagineart-1.5-preview/text-to-image', label: 'ImagineArt 1.5', format: 'aspect_ratio' },
  // Kolors
  { id: 'fal-ai/kolors/image-to-image', label: 'Kolors Image-to-Image', format: 'aspect_ratio' },
  // GPT Image
  { id: 'openai/gpt-image-2', label: 'GPT Image 2', format: 'aspect_ratio' },
  { id: 'openai/gpt-image-2/edit', label: 'GPT Image 2 Edit', format: 'aspect_ratio' },
  // FLUX Klein
  { id: 'fal-ai/flux-2/klein/9b', label: 'FLUX.2 Klein 9B', format: 'flux' },
  // Ideogram
  { id: 'fal-ai/ideogram/v3', label: 'Ideogram V3', format: 'aspect_ratio' },
];

// ---------------------------------------------------------------------------
// Image Model Grouping
// ---------------------------------------------------------------------------

const IMAGE_GROUP_PREFIXES: [string, string][] = [
  ['fal-ai/flux', 'flux'],
  ['fal-ai/kolors', 'kolors'],
  ['openai/', 'openai'],
  ['fal-ai/ideogram', 'ideogram'],
  ['fal-ai/flux-2/klein', 'flux'],
  ['fal-ai/nano-banana', 'nano-banana'],
  ['fal-ai/recraft', 'recraft'],
  ['fal-ai/qwen-image-2', 'qwen'],
  ['fal-ai/bytedance/seedream', 'seedream'],
  ['fal-ai/bria', 'bria'],
  ['bria/', 'bria'],
];

const IMAGE_GROUP_LABELS: Record<string, string> = {
  flux: 'Flux',
  'nano-banana': 'Nano Banana',
  recraft: 'Recraft',
  qwen: 'Qwen Image',
  seedream: 'Seedream',
  bria: 'Bria',
  kolors: 'Kolors',
  openai: 'OpenAI',
  ideogram: 'Ideogram',
  other: 'Other',
};

function getImageGroupId(modelId: string): string {
  if (modelId.startsWith('bria/')) return 'bria';
  for (const [prefix, groupId] of IMAGE_GROUP_PREFIXES) {
    if (prefix === 'bria/') continue;
    if (modelId === prefix || modelId.startsWith(prefix + '/') ||
        (modelId.length > prefix.length && modelId.startsWith(prefix) && /[/\-.]|\d/.test(modelId[prefix.length]!)))
      return groupId;
  }
  return 'other';
}

export type ModelGroup = { id: string; label: string; modelIds: string[] };

export const IMAGE_MODEL_GROUPS: ModelGroup[] = (() => {
  const byGroup: Record<string, string[]> = {};
  for (const o of IMAGE_MODEL_OPTIONS) {
    const g = getImageGroupId(o.id);
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g]!.push(o.id);
  }
  return Object.entries(byGroup)
    .filter(([, ids]) => ids.length > 0)
    .map(([g, ids]) => ({ id: g, label: IMAGE_GROUP_LABELS[g] ?? g, modelIds: ids }));
})();

// ---------------------------------------------------------------------------
// Video Models (from fal.ai — full list)
// ---------------------------------------------------------------------------

export const VIDEO_MODEL_OPTIONS: VideoModelOption[] = [
  // Kling — image-to-video
  { id: 'fal-ai/kling-video/v2.5-turbo/standard/image-to-video', label: 'Kling v2.5' },
  { id: 'fal-ai/kling-video/v2.5-turbo/pro/image-to-video', label: 'Kling v2.5 Turbo Pro' },
  { id: 'fal-ai/kling-video/v2.1/standard/image-to-video', label: 'Kling v2.1' },
  { id: 'fal-ai/kling-video/v2.1/pro/image-to-video', label: 'Kling v2.1 Pro' },
  { id: 'fal-ai/kling-video/v2.1/master/image-to-video', label: 'Kling v2.1 Master' },
  { id: 'fal-ai/kling-video/v2/master/image-to-video', label: 'Kling 2.0 Master' },
  { id: 'fal-ai/kling-video/v2.6/pro/image-to-video', label: 'Kling v2.6 Pro' },
  { id: 'fal-ai/kling-video/v3/pro/image-to-video', label: 'Kling v3 Pro' },
  { id: 'fal-ai/kling-video/v3/standard/image-to-video', label: 'Kling v3 Standard' },
  // Kling — start/end frame
  { id: 'fal-ai/kling-video/o1/image-to-video', label: 'Kling O1 (start→end)', startEndFrame: true },
  { id: 'fal-ai/kling-video/o1/standard/image-to-video', label: 'Kling O1 Standard (start→end)', startEndFrame: true },
  { id: 'fal-ai/kling-video/o3/standard/image-to-video', label: 'Kling O3 (start→end)', startEndFrame: true },
  { id: 'fal-ai/kling-video/o3/pro/image-to-video', label: 'Kling O3 Pro (start→end)', startEndFrame: true },
  // Kling — multi-ref
  { id: 'fal-ai/kling-video/o1/reference-to-video', label: 'Kling O1 Reference-to-Video', multiRef: true },
  { id: 'fal-ai/kling-video/o1/standard/reference-to-video', label: 'Kling O1 Standard Reference-to-Video', multiRef: true },
  { id: 'fal-ai/kling-video/o3/pro/reference-to-video', label: 'Kling O3 Pro Reference-to-Video', multiRef: true },
  { id: 'fal-ai/kling-video/o3/standard/reference-to-video', label: 'Kling O3 Standard Reference-to-Video', multiRef: true },
  // Kling — video edit
  { id: 'fal-ai/kling-video/o1/video-to-video/edit', label: 'Kling O1 Edit Video', videoEdit: true },
  { id: 'fal-ai/kling-video/o1/standard/video-to-video/edit', label: 'Kling O1 Standard Edit Video', videoEdit: true },
  { id: 'fal-ai/kling-video/o1/video-to-video/reference', label: 'Kling O1 Video-to-Video Reference', videoEdit: true },
  { id: 'fal-ai/kling-video/o1/standard/video-to-video/reference', label: 'Kling O1 Standard V2V Reference', videoEdit: true },
  // Kling — motion control
  { id: 'fal-ai/kling-video/v2.6/standard/motion-control', label: 'Kling v2.6 Motion Control', motionControl: true },
  { id: 'fal-ai/kling-video/v2.6/pro/motion-control', label: 'Kling v2.6 Pro Motion Control', motionControl: true },
  { id: 'fal-ai/kling-video/v3/standard/motion-control', label: 'Kling v3 Motion Control', motionControl: true },
  { id: 'fal-ai/kling-video/v3/pro/motion-control', label: 'Kling v3 Pro Motion Control', motionControl: true },
  // Kling — text-to-video
  { id: 'fal-ai/kling-video/v2.6/pro/text-to-video', label: 'Kling v2.6 Pro Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/v2.1/master/text-to-video', label: 'Kling v2.1 Master Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/v2/master/text-to-video', label: 'Kling 2.0 Master Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/v3/pro/text-to-video', label: 'Kling v3 Pro Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/v3/standard/text-to-video', label: 'Kling v3 Standard Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/o3/pro/text-to-video', label: 'Kling O3 Pro Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/o3/standard/text-to-video', label: 'Kling O3 Standard Text-to-Video', textToVideoOnly: true },
  // Kling — avatar / lip-sync
  { id: 'fal-ai/kling-video/ai-avatar/v2/pro', label: 'Kling AI Avatar v2 Pro', avatarAudio: true },
  { id: 'fal-ai/kling-video/ai-avatar/v2/standard', label: 'Kling AI Avatar v2 Standard', avatarAudio: true },
  { id: 'fal-ai/kling-video/v1/standard/ai-avatar', label: 'Kling AI Avatar', avatarAudio: true },
  { id: 'fal-ai/kling-video/v1/pro/ai-avatar', label: 'Kling AI Avatar Pro', avatarAudio: true },
  { id: 'fal-ai/kling-video/lipsync/text-to-video', label: 'Kling LipSync (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/kling-video/lipsync/audio-to-video', label: 'Kling LipSync (audio-to-video)', avatarAudio: true },
  // Google Veo
  { id: 'fal-ai/veo3.1', label: 'Veo 3.1 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/veo3.1/fast', label: 'Veo 3.1 Fast (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/veo3.1/image-to-video', label: 'Veo 3.1 (image-to-video)' },
  { id: 'fal-ai/veo3.1/fast/image-to-video', label: 'Veo 3.1 Fast (image-to-video)' },
  { id: 'fal-ai/veo3.1/reference-to-video', label: 'Veo 3.1 (multi-ref)', multiRef: true },
  { id: 'fal-ai/veo3.1/first-last-frame-to-video', label: 'Veo 3.1 First-Last Frame', startEndFrame: true },
  { id: 'fal-ai/veo3.1/fast/first-last-frame-to-video', label: 'Veo 3.1 Fast First-Last Frame', startEndFrame: true },
  { id: 'fal-ai/veo3.1/extend-video', label: 'Veo 3.1 Extend Video', videoEdit: true },
  { id: 'fal-ai/veo3.1/fast/extend-video', label: 'Veo 3.1 Fast Extend Video', videoEdit: true },
  { id: 'fal-ai/veo3/image-to-video', label: 'Veo 3 (image-to-video)' },
  { id: 'fal-ai/veo3/fast/image-to-video', label: 'Veo 3 Fast (image-to-video)' },
  { id: 'fal-ai/veo3', label: 'Veo 3 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/veo3/fast', label: 'Veo 3 Fast (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/veo2/image-to-video', label: 'Veo 2 (image-to-video)' },
  { id: 'fal-ai/veo2', label: 'Veo 2 (text-to-video)', textToVideoOnly: true },
  // Sora
  { id: 'fal-ai/sora-2/image-to-video', label: 'Sora 2' },
  { id: 'fal-ai/sora-2/image-to-video/pro', label: 'Sora 2 Pro' },
  { id: 'fal-ai/sora-2/text-to-video', label: 'Sora 2 Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/sora-2/text-to-video/pro', label: 'Sora 2 Text-to-Video Pro', textToVideoOnly: true },
  { id: 'fal-ai/sora-2/video-to-video/remix', label: 'Sora 2 Remix', videoEdit: true },
  // Vidu
  { id: 'fal-ai/vidu/start-end-to-video', label: 'Vidu Start-End to Video', startEndFrame: true },
  { id: 'fal-ai/vidu/q3/image-to-video', label: 'Vidu Q3' },
  { id: 'fal-ai/vidu/q3/image-to-video/turbo', label: 'Vidu Q3 Turbo' },
  { id: 'fal-ai/vidu/q3/text-to-video', label: 'Vidu Q3 Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/vidu/q3/text-to-video/turbo', label: 'Vidu Q3 Text-to-Video Turbo', textToVideoOnly: true },
  // Wan
  { id: 'fal-ai/wan-25-preview/image-to-video', label: 'Wan 2.5' },
  { id: 'fal-ai/wan-25-preview/text-to-video', label: 'Wan 2.5 Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/wan/v2.2-a14b/image-to-video', label: 'Wan 2.2' },
  // Minimax
  { id: 'fal-ai/minimax/hailuo-02/standard/image-to-video', label: 'Minimax Hailuo 02 Standard' },
  { id: 'fal-ai/minimax/hailuo-02-fast/image-to-video', label: 'Minimax Fast' },
  { id: 'fal-ai/minimax/hailuo-02/pro/image-to-video', label: 'Minimax Hailuo 02 Pro' },
  { id: 'fal-ai/minimax/hailuo-2.3/pro/image-to-video', label: 'Minimax Hailuo 2.3 Pro' },
  { id: 'fal-ai/minimax/video-01-live', label: 'MiniMax Video 01 Live (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/minimax/video-01-live/image-to-video', label: 'MiniMax Video 01 Live' },
  // Luma
  { id: 'fal-ai/luma-dream-machine/image-to-video', label: 'Luma Dream Machine' },
  { id: 'fal-ai/luma-dream-machine/ray-2/image-to-video', label: 'Luma Ray 2' },
  { id: 'fal-ai/luma-dream-machine/ray-2-flash/image-to-video', label: 'Luma Ray 2 Flash' },
  { id: 'fal-ai/luma-dream-machine/ray-2', label: 'Luma Ray 2 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/luma-dream-machine/ray-2-flash', label: 'Luma Ray 2 Flash (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/luma-photon', label: 'Luma Photon', textToVideoOnly: true },
  { id: 'fal-ai/luma-dream-machine/ray-2/modify', label: 'Luma Ray 2 Modify', videoEdit: true },
  { id: 'fal-ai/luma-dream-machine/ray-2-flash/modify', label: 'Luma Ray 2 Flash Modify', videoEdit: true },
  { id: 'fal-ai/luma-dream-machine/ray-2/reframe', label: 'Luma Ray 2 Reframe', videoEdit: true },
  { id: 'fal-ai/luma-dream-machine/ray-2-flash/reframe', label: 'Luma Ray 2 Flash Reframe', videoEdit: true },
  // LTX
  { id: 'fal-ai/ltx-2-19b/image-to-video', label: 'LTX-2 19B' },
  { id: 'fal-ai/ltx-2/image-to-video/fast', label: 'LTX-2 Fast' },
  { id: 'fal-ai/ltx-2.3/image-to-video', label: 'LTX-2.3' },
  { id: 'fal-ai/ltx-2.3/image-to-video/fast', label: 'LTX-2.3 Fast' },
  { id: 'fal-ai/ltx-2.3/text-to-video', label: 'LTX-2.3 Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/ltx-2.3/text-to-video/fast', label: 'LTX-2.3 Text-to-Video Fast', textToVideoOnly: true },
  { id: 'fal-ai/ltx-2.3/extend-video', label: 'LTX-2.3 Extend Video', videoEdit: true },
  { id: 'fal-ai/ltx-2.3/retake-video', label: 'LTX-2.3 Retake Video', videoEdit: true },
  { id: 'fal-ai/ltx-2.3/audio-to-video', label: 'LTX-2.3 Audio-to-Video', avatarAudio: true },
  // MAGI
  { id: 'fal-ai/magi', label: 'MAGI-1 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/magi/image-to-video', label: 'MAGI-1' },
  { id: 'fal-ai/magi/extend-video', label: 'MAGI-1 Extend Video', videoEdit: true },
  { id: 'fal-ai/magi-distilled/image-to-video', label: 'MAGI Distilled' },
  { id: 'fal-ai/magi-distilled/extend-video', label: 'MAGI Distilled Extend', videoEdit: true },
  // PixVerse
  { id: 'fal-ai/pixverse/v3.5/image-to-video', label: 'PixVerse v3.5' },
  { id: 'fal-ai/pixverse/v3.5/image-to-video/fast', label: 'PixVerse v3.5 Fast' },
  { id: 'fal-ai/pixverse/v4.5/image-to-video', label: 'PixVerse v4.5' },
  { id: 'fal-ai/pixverse/v5/image-to-video', label: 'PixVerse v5' },
  { id: 'fal-ai/pixverse/v5/text-to-video', label: 'PixVerse v5 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/pixverse/v5/transition', label: 'PixVerse v5 Transition', startEndFrame: true },
  { id: 'fal-ai/pixverse/v5.5/image-to-video', label: 'PixVerse v5.5' },
  { id: 'fal-ai/pixverse/v5.5/effects', label: 'PixVerse v5.5 Effects', videoEdit: true },
  { id: 'fal-ai/pixverse/v5.6/image-to-video', label: 'PixVerse v5.6' },
  { id: 'fal-ai/pixverse/v5.6/transition', label: 'PixVerse v5.6 Transition', startEndFrame: true },
  { id: 'fal-ai/pixverse/v5.6/text-to-video', label: 'PixVerse v5.6 Text-to-Video', textToVideoOnly: true },
  { id: 'fal-ai/pixverse/swap', label: 'PixVerse Swap', videoEdit: true },
  // Editto
  { id: 'fal-ai/editto', label: 'Editto (video edit)', videoEdit: true },
  // Hunyuan
  { id: 'fal-ai/hunyuan-video', label: 'Hunyuan Video (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/hunyuan-video-image-to-video', label: 'Hunyuan Video' },
  { id: 'fal-ai/hunyuan-video-v1.5/text-to-video', label: 'Hunyuan 1.5 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/hunyuan-video/video-to-video', label: 'Hunyuan Video-to-Video', videoEdit: true },
  { id: 'fal-ai/hunyuan-video-foley', label: 'Hunyuan Foley (add sound)', videoEdit: true },
  // Grok (xAI)
  { id: 'xai/grok-imagine-video/text-to-video', label: 'Grok (text-to-video)', textToVideoOnly: true },
  { id: 'xai/grok-imagine-video/image-to-video', label: 'Grok (image-to-video)' },
  { id: 'xai/grok-imagine-video/reference-to-video', label: 'Grok (multi-ref)', multiRef: true },
  { id: 'xai/grok-imagine-video/extend-video', label: 'Grok Extend', videoEdit: true },
  { id: 'xai/grok-imagine-video/edit-video', label: 'Grok Edit', videoEdit: true },
  // Seedance (ByteDance)
  { id: 'bytedance/seedance-2.0/text-to-video', label: 'Seedance 2.0 (text-to-video)', textToVideoOnly: true },
  { id: 'bytedance/seedance-2.0/image-to-video', label: 'Seedance 2.0', startEndFrame: true },
  { id: 'bytedance/seedance-2.0/reference-to-video', label: 'Seedance 2.0 (multi-ref)', multiRef: true },
  { id: 'bytedance/seedance-2.0/fast/text-to-video', label: 'Seedance 2.0 Fast (text-to-video)', textToVideoOnly: true },
  { id: 'bytedance/seedance-2.0/fast/image-to-video', label: 'Seedance 2.0 Fast', startEndFrame: true },
  { id: 'bytedance/seedance-2.0/fast/reference-to-video', label: 'Seedance 2.0 Fast (multi-ref)', multiRef: true },
  { id: 'fal-ai/bytedance/seedance/v1.5/pro/text-to-video', label: 'Seedance 1.5 Pro (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/bytedance/seedance/v1.5/pro/image-to-video', label: 'Seedance 1.5 Pro', startEndFrame: true },
  { id: 'fal-ai/bytedance/seedance/v1/pro/image-to-video', label: 'Seedance 1.0 Pro' },
  { id: 'fal-ai/bytedance/seedance/v1/pro/text-to-video', label: 'Seedance 1.0 Pro (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/bytedance/seedance/v1/pro/fast/image-to-video', label: 'Seedance 1.0 Pro Fast' },
  { id: 'fal-ai/bytedance/seedance/v1/pro/fast/text-to-video', label: 'Seedance 1.0 Pro Fast (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/bytedance/seedance/v1/lite/image-to-video', label: 'Seedance 1.0 Lite' },
  { id: 'fal-ai/bytedance/seedance/v1/lite/text-to-video', label: 'Seedance 1.0 Lite (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/bytedance/seedance/v1/lite/reference-to-video', label: 'Seedance 1.0 Lite (multi-ref)', multiRef: true },
  // Other
  { id: 'fal-ai/mochi-v1', label: 'Mochi 1 (text-to-video)', textToVideoOnly: true },
  { id: 'fal-ai/stable-video', label: 'Stable Video Diffusion' },
  { id: 'fal-ai/ovi/image-to-video', label: 'Ovi' },
  { id: 'fal-ai/goal-force', label: 'Goal Force (physics-based)' },
  { id: 'fal-ai/mirelo-ai/sfx-v1/video-to-video', label: 'Mirelo SFX (add sound)', videoEdit: true },
  // Avatar / Lip-sync
  { id: 'fal-ai/creatify/aurora', label: 'Creatify Aurora', avatarAudio: true },
  { id: 'fal-ai/bytedance/omnihuman/v1.5', label: 'Omnihuman 1.5', avatarAudio: true },
  { id: 'veed/fabric-1.0', label: 'VEED Fabric 1.0', avatarAudio: true },
  { id: 'veed/fabric-1.0/fast', label: 'VEED Fabric 1.0 Fast', avatarAudio: true },
  { id: 'fal-ai/ai-avatar/single-text', label: 'MultiTalk (image + text)', avatarText: true },
  { id: 'fal-ai/sync-lipsync/v2/pro', label: 'Sync Lipsync v2 Pro', avatarVideoAudio: true },
  { id: 'fal-ai/sync-lipsync/v2', label: 'Sync Lipsync v2', avatarVideoAudio: true },
  { id: 'fal-ai/sync-lipsync/react-1', label: 'Sync Lipsync React-1', avatarVideoAudio: true },
  { id: 'fal-ai/pixverse/lipsync', label: 'PixVerse Lipsync', avatarVideoAudio: true },
  { id: 'fal-ai/infinitalk', label: 'Infinitalk', avatarAudio: true },
  { id: 'fal-ai/hunyuan-avatar', label: 'Hunyuan Avatar', avatarAudio: true },
  { id: 'fal-ai/musetalk', label: 'MuseTalk', avatarVideoAudio: true },
  // Utility
  { id: 'fal-ai/topaz/upscale/video', label: 'Topaz Video Upscale', utilityVideo: true },
  { id: 'fal-ai/video-upscaler', label: 'Video Upscaler (RealESRGAN)', utilityVideo: true },
  { id: 'bria/video/background-removal', label: 'Bria Video BG Removal', utilityVideo: true },
  { id: 'fal-ai/ben/v2/video', label: 'Ben v2 Video BG Removal', utilityVideo: true },
  { id: 'fal-ai/birefnet/v2/video', label: 'BiRefNet v2 Video BG Removal', utilityVideo: true },
];

// ---------------------------------------------------------------------------
// Video Model Grouping
// ---------------------------------------------------------------------------

const VIDEO_GROUP_PREFIXES: [string, string][] = [
  ['bytedance/seedance-2.0', 'seedance'],
  ['fal-ai/bytedance/seedance', 'seedance'],
  ['fal-ai/kling-video', 'kling'],
  ['fal-ai/sora-2', 'sora'],
  ['fal-ai/vidu', 'vidu'],
  ['fal-ai/wan', 'wan'],
  ['fal-ai/minimax', 'minimax'],
  ['fal-ai/luma', 'luma'],
  ['fal-ai/ltx', 'ltx'],
  ['fal-ai/magi', 'magi'],
  ['fal-ai/pixverse', 'pixverse'],
  ['fal-ai/editto', 'editto'],
  ['fal-ai/hunyuan', 'hunyuan'],
  ['xai/grok-imagine-video', 'grok'],
  ['fal-ai/mochi', 'mochi'],
  ['fal-ai/stable-video', 'stable'],
  ['fal-ai/ovi', 'ovi'],
  ['fal-ai/goal-force', 'goalforce'],
  ['fal-ai/mirelo', 'mirelo'],
  ['fal-ai/veo', 'veo'],
];

const VIDEO_GROUP_LABELS: Record<string, string> = {
  kling: 'Kling',
  veo: 'Google Veo',
  sora: 'Sora',
  vidu: 'Vidu',
  wan: 'Wan',
  minimax: 'Minimax',
  luma: 'Luma',
  ltx: 'LTX',
  magi: 'MAGI',
  pixverse: 'PixVerse',
  editto: 'Editto',
  hunyuan: 'Hunyuan',
  grok: 'Grok (xAI)',
  seedance: 'Seedance',
  mochi: 'Mochi',
  stable: 'Stable Video',
  ovi: 'Ovi',
  goalforce: 'Goal Force',
  mirelo: 'Mirelo',
  openai: 'OpenAI',
  ideogram: 'Ideogram',
  other: 'Other',
};

function getVideoGroupId(modelId: string): string {
  for (const [prefix, groupId] of VIDEO_GROUP_PREFIXES) {
    if (modelId === prefix) return groupId;
    if (modelId.startsWith(prefix + '/')) return groupId;
    if (modelId.length > prefix.length && modelId.startsWith(prefix) && /[/\-.]|\d/.test(modelId[prefix.length]!))
      return groupId;
  }
  return 'other';
}

const GENERAL_VIDEO_MODELS = VIDEO_MODEL_OPTIONS.filter(
  o => !o.avatarAudio && !o.avatarText && !o.avatarVideoAudio && !o.utilityVideo
);

export const VIDEO_MODEL_GROUPS: ModelGroup[] = (() => {
  const byGroup: Record<string, string[]> = {};
  for (const o of GENERAL_VIDEO_MODELS) {
    const g = getVideoGroupId(o.id);
    if (!byGroup[g]) byGroup[g] = [];
    byGroup[g]!.push(o.id);
  }
  return Object.entries(byGroup)
    .filter(([, ids]) => ids.length > 0)
    .map(([g, ids]) => ({ id: g, label: VIDEO_GROUP_LABELS[g] ?? g, modelIds: ids }));
})();

// ---------------------------------------------------------------------------
// Video Model Type Filter
// ---------------------------------------------------------------------------

export const VIDEO_MODEL_TYPE_FILTERS: { id: VideoModelTypeFilter; label: string }[] = [
  { id: 'all', label: 'All types' },
  { id: 'image-to-video', label: 'Image to Video' },
  { id: 'text-to-video', label: 'Text to Video' },
  { id: 'video-edit', label: 'Video edit / extend' },
  { id: 'motion-control', label: 'Motion control' },
  { id: 'start-end-frame', label: 'Start / end frame' },
  { id: 'multi-reference', label: 'Multi-reference' },
  { id: 'avatar', label: 'Talking avatar' },
  { id: 'lip-sync', label: 'Lip-sync (video+audio)' },
  { id: 'utility', label: 'Utility (upscale, bg removal)' },
];

export function getVideoModelType(opt: VideoModelOption): VideoModelTypeFilter {
  if (opt.utilityVideo) return 'utility';
  if (opt.avatarVideoAudio) return 'lip-sync';
  if (opt.avatarAudio || opt.avatarText) return 'avatar';
  if (opt.motionControl) return 'motion-control';
  if (opt.startEndFrame) return 'start-end-frame';
  if (opt.multiRef) return 'multi-reference';
  if (opt.videoEdit) return 'video-edit';
  if (opt.textToVideoOnly) return 'text-to-video';
  return 'image-to-video';
}

export function filterVideoModelsByType(typeFilter: VideoModelTypeFilter): VideoModelOption[] {
  if (typeFilter === 'all') return VIDEO_MODEL_OPTIONS;
  return VIDEO_MODEL_OPTIONS.filter(o => getVideoModelType(o) === typeFilter);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export const IMAGE_SIZE_OPTIONS = [
  { id: 'square', label: 'Square (1:1)' },
  { id: 'portrait_4_3', label: 'Portrait 3:4' },
  { id: 'portrait_16_9', label: 'Portrait 9:16' },
  { id: 'landscape_4_3', label: 'Landscape 4:3' },
  { id: 'landscape_16_9', label: 'Landscape 16:9' },
];

export const IMAGE_RESOLUTION_OPTIONS = [
  { id: 'sd', label: 'SD' },
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
];

export function isImageModelGroupId(id: string): boolean {
  return id === 'auto' || id.startsWith('group:');
}

export function getImageModelIdsInGroup(groupId: string): string[] {
  if (groupId === 'auto') return IMAGE_MODEL_OPTIONS.map(o => o.id);
  const g = groupId.replace('group:', '');
  const group = IMAGE_MODEL_GROUPS.find(gr => gr.id === g);
  return group ? group.modelIds : [];
}

export function isVideoModelGroupId(id: string): boolean {
  return id === 'auto' || id.startsWith('group:');
}

export function getVideoModelIdsInGroup(groupId: string): string[] {
  if (groupId === 'auto') return VIDEO_MODEL_OPTIONS.map(o => o.id);
  const g = groupId.replace('group:', '');
  const group = VIDEO_MODEL_GROUPS.find(gr => gr.id === g);
  return group ? group.modelIds : [];
}

export function getImageModelLabel(modelId: string): string {
  return IMAGE_MODEL_OPTIONS.find(o => o.id === modelId)?.label ?? modelId;
}

export function getVideoModelLabel(modelId: string): string {
  return VIDEO_MODEL_OPTIONS.find(o => o.id === modelId)?.label ?? modelId;
}

export function getImageModelFormat(modelId: string): 'flux' | 'aspect_ratio' {
  return IMAGE_MODEL_OPTIONS.find(o => o.id === modelId)?.format ?? 'flux';
}

export function imageSizeToAspectRatio(imageSize: string): string {
  const map: Record<string, string> = {
    square: '1:1',
    portrait_4_3: '3:4',
    portrait_16_9: '9:16',
    landscape_4_3: '4:3',
    landscape_16_9: '16:9',
  };
  return map[imageSize] ?? '1:1';
}

export const DEVICE_PRESETS = {
  hh1x3: { name: 'HH 1x3', width: 930, height: 2174, fps: 60 },
  solo: { name: 'Solo', width: 880, height: 880, fps: 60 },
};

export const DEVICE_MASKS: Record<string, { circles: { cx: number; cy: number; r: number }[] }> = {
  hh1x3: {
    circles: [
      { cx: 465, cy: 465, r: 445 },
      { cx: 465, cy: 1087, r: 445 },
      { cx: 465, cy: 1709, r: 445 },
    ],
  },
  solo: {
    circles: [
      { cx: 440, cy: 440, r: 440 },
    ],
  },
};

export const VIDEO_ASPECT_RATIO_OPTIONS = [
  { id: '1:1', label: 'Square (1:1)' },
  { id: '3:4', label: 'Portrait 3:4' },
  { id: '9:16', label: 'Portrait 9:16' },
  { id: '4:3', label: 'Landscape 4:3' },
  { id: '16:9', label: 'Landscape 16:9' },
];

export const VIDEO_QUALITY_OPTIONS = [
  { id: 'sd', label: 'SD' },
  { id: '1k', label: '1K' },
  { id: '2k', label: '2K' },
  { id: '4k', label: '4K' },
];

export const VIDEO_FPS_OPTIONS = [
  { id: 24, label: '24 fps' },
  { id: 30, label: '30 fps' },
  { id: 60, label: '60 fps' },
];

export const STRATEGY_OPTIONS = [
  { id: 'economy', label: 'Economy', description: 'Cheapest models' },
  { id: 'balance', label: 'Balance', description: 'Cost vs quality' },
  { id: 'quality', label: 'Quality', description: 'Best results' },
];

export const VIDEO_STRATEGY_OPTIONS = STRATEGY_OPTIONS;

export function aspectRatioToNumeric(ar: string): number {
  const [w, h] = ar.split(':').map(Number);
  return w / h;
}
