import { ImageModel, VideoModel } from './types';

export const IMAGE_MODELS: ImageModel[] = [
  { id: 'fal-ai/flux/schnell', name: 'FLUX Schnell', group: 'Flux', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux/dev', name: 'FLUX Dev', group: 'Flux', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux-pro/v1.1', name: 'FLUX Pro 1.1', group: 'Flux', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux-pro/kontext', name: 'FLUX Kontext Pro', group: 'Flux', supportsReferences: true, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux-2/schnell', name: 'FLUX.2 Schnell', group: 'Flux 2', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux-2/dev', name: 'FLUX.2 Dev', group: 'Flux 2', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/flux-2/pro', name: 'FLUX.2 Pro', group: 'Flux 2', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/recraft-v3', name: 'Recraft v3', group: 'Recraft', supportsReferences: false, defaultSize: '1024x1820', sizes: ['1024x1024', '1024x1820', '1820x1024'] },
  { id: 'fal-ai/seedream-3.0', name: 'Seedream 3.0', group: 'Other', supportsReferences: false, defaultSize: 'portrait_16_9', sizes: ['square', 'portrait_4_3', 'portrait_16_9', 'landscape_4_3', 'landscape_16_9'] },
  { id: 'fal-ai/bria/text-to-image/hd', name: 'Bria HD', group: 'Other', supportsReferences: false, defaultSize: '9:16', sizes: ['1:1', '4:3', '9:16', '16:9', '3:4'] },
];

export const VIDEO_MODELS: VideoModel[] = [
  { id: 'fal-ai/kling-video/v2.5/standard/image-to-video', name: 'Kling v2.5', group: 'Kling', durations: [5, 10], defaultDuration: 5, supportsImageRef: true, supportsVideoRef: false },
  { id: 'fal-ai/kling-video/v3/standard/image-to-video', name: 'Kling v3', group: 'Kling', durations: [5, 10], defaultDuration: 5, supportsImageRef: true, supportsVideoRef: false },
  { id: 'fal-ai/minimax-video/image-to-video', name: 'Minimax Hailuo', group: 'Minimax', durations: [5], defaultDuration: 5, supportsImageRef: true, supportsVideoRef: false },
  { id: 'fal-ai/veo3', name: 'Veo 3', group: 'Google', durations: [5, 8], defaultDuration: 5, supportsImageRef: false, supportsVideoRef: false },
  { id: 'fal-ai/ltx-video-2.3/image-to-video', name: 'LTX 2.3', group: 'LTX', durations: [3, 5, 7], defaultDuration: 5, supportsImageRef: true, supportsVideoRef: false },
  { id: 'fal-ai/wan/v2.1/image-to-video', name: 'WAN 2.1', group: 'WAN', durations: [3, 5], defaultDuration: 5, supportsImageRef: true, supportsVideoRef: true },
];

export const MODEL_GROUPS = {
  image: [...new Set(IMAGE_MODELS.map(m => m.group))],
  video: [...new Set(VIDEO_MODELS.map(m => m.group))],
};

export const DEVICE_PRESETS = {
  hh1x3: { name: 'HH 1x3', width: 930, height: 2174, fps: 60 },
  solo: { name: 'Solo', width: 880, height: 880, fps: 60 },
  l40: { name: 'L40', width: 1080, height: 1920, fps: 60 },
};
