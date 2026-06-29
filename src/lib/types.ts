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

export interface TemplateRef {
  url: string;
  type: 'image' | 'video' | 'audio';
  name: string;
}

export interface TemplateSlot {
  id: string;
  modelId: string;
  modelLabel: string;
  typeFilter: string;
  instruction: string;
  duration: number;
  aspectRatio: string;
  quality: string;
  fps: number;
  strategy: string;
  references: TemplateRef[];
}

export interface Template {
  id: string;
  name: string;
  description: string;
  type: 'image' | 'video';
  device: 'hh1x3' | 'solo' | 'any';
  promptTemplate: string;
  slots: TemplateSlot[];
  /** @deprecated use slots instead */
  modelId?: string;
  /** @deprecated use slots instead */
  modelLabel?: string;
  /** @deprecated use slots instead */
  params?: Record<string, unknown>;
  /** @deprecated use slots instead */
  references?: TemplateRef[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppUser {
  userId: string;
  userName: string;
  email?: string;
  role: string;
  authMethod: 'sso' | 'otp';
  hasFalKey?: boolean;
  systemPrompt?: string;
}

export interface Project {
  id: string;
  userId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
}

export interface GenerationCost {
  amount: number;
  currency: string;
  details?: string;
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
  estimatedCost?: GenerationCost;
  actualCost?: GenerationCost;
  createdAt: number;
}

export interface ImageFormCache {
  references: { url: string; name: string }[];
  instruction: string;
  modelPref: string;
  desiredSize: string;
  desiredResolution: string;
}

export interface VideoFormCache {
  instruction: string;
  modelPref: string;
  typeFilter: string;
  desiredDuration: number;
  aspectRatio: string;
  quality: string;
  fps: number;
  strategy: string;
  sourceImage: string;
  sourceVideo: TemplateRef | null;
  audioRef: TemplateRef | null;
  endImage: string;
  multiRefs: TemplateRef[];
}

export interface ProjectCacheData {
  image?: ImageFormCache;
  video?: VideoFormCache;
  updatedAt: number;
}

// Server-side job types (shared between API and client)
export type JobStatus = 'preparing' | 'prepared' | 'generating' | 'complete' | 'error';

export interface VideoParams {
  aspectRatio?: string;
  quality?: string;
  fps?: number;
  duration?: number;
}

export interface JobPrepareResult {
  prompt: string;
  model: string;
  modelLabel: string;
  reasoning: string;
  estimatedCost?: GenerationCost;
  params?: VideoParams;
}

export interface JobResult {
  images?: { url: string }[];
  video?: { url: string };
  prompt: string;
  model: string;
  modelLabel: string;
  reasoning?: string;
  cost?: GenerationCost;
}

export interface JobData {
  id: string;
  userId: string;
  projectId: string;
  type: 'image' | 'video';
  status: JobStatus;
  input: Record<string, unknown>;
  prepareResult?: JobPrepareResult;
  result?: JobResult;
  error?: string;
  createdAt: number;
  updatedAt: number;
}
