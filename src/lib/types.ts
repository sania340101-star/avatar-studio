export interface ImageModel {
  id: string;
  name: string;
  group: string;
  supportsReferences: boolean;
  defaultSize: string;
  sizes: string[];
}

export interface VideoModel {
  id: string;
  name: string;
  group: string;
  durations: number[];
  defaultDuration: number;
  supportsImageRef: boolean;
  supportsVideoRef: boolean;
}

export interface GenerationResult {
  id: string;
  type: 'image' | 'video';
  url: string;
  model: string;
  prompt: string;
  createdAt: string;
  approved?: boolean;
}

export interface Template {
  id: string;
  name: string;
  device: 'hh1x3' | 'solo' | 'l40';
  animationType: 'idle' | 'talk';
  model: string;
  duration: number;
  fps: number;
  resolution: string;
  promptTemplate: string;
  referenceVideos: string[];
}

export interface PipelineJob {
  id: string;
  templateId: string;
  sourceImage: string;
  referenceVideo: string;
  status: 'queued' | 'running' | 'done' | 'error';
  progress: number;
  resultUrl?: string;
  approved?: boolean;
}

export interface AppUser {
  userId: string;
  userName: string;
  role: string;
  authMethod: 'sso' | 'otp';
  falKey?: string;
}
