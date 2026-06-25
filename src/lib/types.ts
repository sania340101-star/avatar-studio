export type ImageModelRequestFormat = 'flux' | 'aspect_ratio';

export interface ImageModelOption {
  id: string;
  label: string;
  format: ImageModelRequestFormat;
}

export interface VideoModelOption {
  id: string;
  label: string;
  textToVideoOnly?: boolean;
  avatarAudio?: boolean;
  avatarText?: boolean;
  avatarVideoAudio?: boolean;
  utilityVideo?: boolean;
  multiRef?: boolean;
  motionControl?: boolean;
  startEndFrame?: boolean;
  videoEdit?: boolean;
}

export type VideoModelTypeFilter =
  | 'all'
  | 'text-to-video'
  | 'image-to-video'
  | 'video-edit'
  | 'motion-control'
  | 'start-end-frame'
  | 'multi-reference'
  | 'lip-sync'
  | 'avatar'
  | 'utility';

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

export interface Project {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface Generation {
  id: string;
  projectId: string;
  userId: string;
  type: 'image' | 'video';
  modelId: string;
  modelLabel: string;
  prompt: string;
  params: Record<string, unknown>;
  referenceUrls: string[];
  resultUrls: string[];
  status: 'pending' | 'completed' | 'failed';
  error?: string;
  parentId?: string;
  createdAt: number;
}
