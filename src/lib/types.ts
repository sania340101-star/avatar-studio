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

export interface Template {
  id: string;
  name: string;
  description: string;
  type: 'image' | 'video';
  device: 'hh1x3' | 'solo' | 'any';
  modelId: string;
  modelLabel: string;
  promptTemplate: string;
  params: Record<string, unknown>;
  references: TemplateRef[];
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface AppUser {
  userId: string;
  userName: string;
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
