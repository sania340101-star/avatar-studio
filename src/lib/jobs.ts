import { writeFileSync } from 'fs';
import { join, extname } from 'path';
import { getUploadsDir } from '@/lib/storage';
import { checkBudget, recordSpending } from '@/lib/billing';
import { JobData } from '@/lib/types';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';

const g = globalThis as unknown as { __avatarJobs?: Map<string, JobData> };
if (!g.__avatarJobs) g.__avatarJobs = new Map();
const jobs = g.__avatarJobs;

const COMPLETED_TTL = 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  for (const [id, job] of jobs) {
    if ((job.status === 'complete' || job.status === 'error') && now - job.updatedAt > COMPLETED_TTL) {
      jobs.delete(id);
    }
  }
}, 5 * 60 * 1000).unref?.();

async function proxyResultUrl(url: string): Promise<string> {
  if (!url || url.startsWith('/api/files/')) return url;
  try {
    const res = await fetch(url);
    if (!res.ok) return url;
    const buffer = Buffer.from(await res.arrayBuffer());
    const urlPath = new URL(url).pathname;
    const ext = extname(urlPath) || '.png';
    const filename = `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    writeFileSync(join(getUploadsDir(), filename), buffer);
    return `/api/files/${filename}`;
  } catch {
    return url;
  }
}

export function getJob(jobId: string): JobData | null {
  return jobs.get(jobId) || null;
}

export function findActiveJob(userId: string, projectId: string, type: string): JobData | null {
  for (const job of jobs.values()) {
    if (job.userId === userId && job.projectId === projectId && job.type === type &&
        job.status !== 'complete' && job.status !== 'error') {
      return job;
    }
  }
  return null;
}

export function createJob(
  userId: string,
  projectId: string,
  type: 'image' | 'video',
  input: Record<string, unknown>,
  falKey: string,
): JobData {
  const existing = findActiveJob(userId, projectId, type);
  if (existing) {
    existing.status = 'error';
    existing.error = 'Cancelled — new job started';
    existing.updatedAt = Date.now();
  }

  const job: JobData = {
    id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    projectId,
    type,
    status: 'preparing',
    input,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  jobs.set(job.id, job);

  runPrepare(job, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Prepare failed';
    job.updatedAt = Date.now();
  });

  return job;
}

export function confirmJob(job: JobData, editedPrompt: string, editedModel: string, falKey: string, editedParams?: Record<string, unknown>): void {
  if (job.status !== 'prepared') return;

  const budget = checkBudget(job.userId);
  if (!budget.allowed) {
    job.status = 'error';
    job.error = `Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`;
    job.updatedAt = Date.now();
    return;
  }

  if (editedParams) {
    Object.assign(job.input, editedParams);
  }

  job.status = 'generating';
  job.updatedAt = Date.now();

  runGenerate(job, editedPrompt, editedModel, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Generation failed';
    job.updatedAt = Date.now();
  });
}

async function runPrepare(job: JobData, falKey: string) {
  const res = await fetch(`${AGENT_URL}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
    body: JSON.stringify({ ...job.input, type: job.type, falKey }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Agent error (${res.status})`);

  job.prepareResult = {
    prompt: data.prompt || '',
    model: data.model || '',
    modelLabel: data.modelLabel || '',
    reasoning: data.reasoning || '',
    estimatedCost: data.estimatedCost || undefined,
    params: data.params || undefined,
  };
  job.status = 'prepared';
  job.updatedAt = Date.now();
}

async function runGenerate(job: JobData, prompt: string, model: string, falKey: string) {
  const res = await fetch(`${AGENT_URL}/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
    body: JSON.stringify({ ...job.input, type: job.type, instruction: prompt, model, falKey }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Agent error (${res.status})`);

  const costUsd = typeof data.cost?.amount === 'number' ? data.cost.amount : 0;
  if (costUsd > 0) recordSpending(job.userId, costUsd, data.model || '', job.type);

  if (job.type === 'video') {
    const videoUrl = data.video?.url;
    const localUrl = videoUrl ? await proxyResultUrl(videoUrl) : undefined;
    job.result = {
      video: localUrl ? { url: localUrl } : data.video,
      prompt: data.prompt, model: data.model, modelLabel: data.modelLabel,
      reasoning: data.reasoning, cost: data.cost || undefined,
    };
  } else {
    const rawImages: { url: string }[] = data.images || [];
    const images = await Promise.all(rawImages.map(async img => ({ url: await proxyResultUrl(img.url) })));
    job.result = {
      images, prompt: data.prompt, model: data.model, modelLabel: data.modelLabel,
      reasoning: data.reasoning, cost: data.cost || undefined,
    };
  }

  job.status = 'complete';
  job.updatedAt = Date.now();
}
