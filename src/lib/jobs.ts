import { writeFileSync, readFileSync, existsSync, unlinkSync, mkdirSync, renameSync, statSync } from 'fs';
import { join, extname } from 'path';
import { execSync } from 'child_process';
import { getUploadsDir } from '@/lib/storage';
import { checkBudget, recordSpending } from '@/lib/billing';
import { JobData, TemplateSlot, PoseMatrix, GenerationCost } from '@/lib/types';

const AGENT_URL = process.env.AGENT_URL || 'http://172.18.16.24:3391';
const SERVICE_KEY = process.env.INTERNAL_SERVICE_KEY || '';
const DATA_DIR = process.env.DATA_DIR || join(process.cwd(), 'data');
const JOBS_FILE = join(DATA_DIR, 'jobs.json');

function ensureDataDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function loadJobs(): Map<string, JobData> {
  try {
    const data: JobData[] = JSON.parse(readFileSync(JOBS_FILE, 'utf-8'));
    return new Map(data.map(j => [j.id, j]));
  } catch {
    return new Map();
  }
}

function persistJobs() {
  ensureDataDir();
  const arr = Array.from(jobs.values());
  const tmp = JOBS_FILE + '.tmp';
  writeFileSync(tmp, JSON.stringify(arr, null, 2));
  renameSync(tmp, JOBS_FILE);
}

const g = globalThis as unknown as { __avatarJobs?: Map<string, JobData>; __avatarJobsLoaded?: boolean };
if (!g.__avatarJobs) g.__avatarJobs = new Map();
if (!g.__avatarJobsLoaded) {
  const loaded = loadJobs();
  for (const [id, job] of loaded) g.__avatarJobs.set(id, job);
  g.__avatarJobsLoaded = true;
}
const jobs = g.__avatarJobs;

const COMPLETED_TTL = 24 * 60 * 60 * 1000;
setInterval(() => {
  const now = Date.now();
  let changed = false;
  for (const [id, job] of jobs) {
    if ((job.status === 'complete' || job.status === 'error') && now - job.updatedAt > COMPLETED_TTL) {
      jobs.delete(id);
      changed = true;
    }
  }
  if (changed) persistJobs();
}, 5 * 60 * 1000).unref?.();

const ALLOWED_RESULT_HOSTS = ['fal.media', 'v3.fal.media', 'storage.googleapis.com', 'fal-cdn.batuhan.co'];

export async function proxyResultUrl(url: string): Promise<string> {
  if (!url || url.startsWith('/api/files/')) return url;
  try {
    const parsed = new URL(url);
    if (!ALLOWED_RESULT_HOSTS.some(h => parsed.hostname === h || parsed.hostname.endsWith('.' + h))) {
      console.error(`[proxyResultUrl] blocked non-allowlisted host: ${parsed.hostname}`);
      return url;
    }
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`[proxyResultUrl] download failed (${res.status}): ${url}`);
      return url;
    }
    const buffer = Buffer.from(await res.arrayBuffer());
    const urlPath = new URL(url).pathname;
    let ext = extname(urlPath);
    if (!ext) {
      const ct = res.headers.get('content-type') || '';
      if (ct.includes('video/mp4') || ct.includes('video/')) ext = '.mp4';
      else if (ct.includes('image/png')) ext = '.png';
      else if (ct.includes('image/jpeg')) ext = '.jpg';
      else if (ct.includes('image/webp')) ext = '.webp';
      else ext = '.png';
    }
    const filename = `result-${Date.now()}-${Math.random().toString(36).slice(2, 8)}${ext}`;
    writeFileSync(join(getUploadsDir(), filename), buffer);
    return `/api/files/${filename}`;
  } catch (e) {
    console.error(`[proxyResultUrl] error for ${url}:`, e instanceof Error ? e.message : e);
    return url;
  }
}

async function applySeamlessLoop(localUrl: string, blendFrames: number, transition: string, crf: number = 18): Promise<string> {
  const uploadsDir = getUploadsDir();
  const filename = localUrl.replace('/api/files/', '');
  const inputPath = join(uploadsDir, filename);
  const ts = Date.now();
  const outputName = `${ts}-loop-output.mp4`;
  const outputPath = join(uploadsDir, outputName);

  const probeCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=r_frame_rate,duration -of json "${inputPath}"`;
  const probeRaw = execSync(probeCmd, { timeout: 15000 }).toString();
  const stream = JSON.parse(probeRaw).streams?.[0];
  if (!stream) throw new Error('Could not probe video for seamless loop');

  const [num, den] = (stream.r_frame_rate || '30/1').split('/');
  const fps = parseInt(num) / (parseInt(den) || 1);
  const totalDuration = parseFloat(stream.duration || '0');
  const blendSec = blendFrames / fps;
  if (blendSec >= totalDuration * 0.5) throw new Error('Blend too long for video duration');

  const tailStart = totalDuration - blendSec;
  const bodyEnd = totalDuration - blendSec;
  const filter = [
    `[0]split=3[a][b][c]`,
    `[a]trim=start=${tailStart.toFixed(4)}:end=${totalDuration.toFixed(4)},setpts=PTS-STARTPTS[tail]`,
    `[b]trim=start=0:end=${blendSec.toFixed(4)},setpts=PTS-STARTPTS[head]`,
    `[c]trim=start=${blendSec.toFixed(4)}:end=${bodyEnd.toFixed(4)},setpts=PTS-STARTPTS[body]`,
    `[tail][head]xfade=transition=${transition}:duration=${blendSec.toFixed(4)}:offset=0[blend]`,
    `[blend][body]concat=n=2:v=1:a=0[out]`,
  ].join('; ');

  const cmd = `ffmpeg -y -i "${inputPath}" -filter_complex "${filter}" -map "[out]" -c:v libx264 -preset fast -crf ${crf} -pix_fmt yuv420p -an "${outputPath}"`;
  execSync(cmd, { timeout: 120000 });

  if (!existsSync(outputPath)) throw new Error('ffmpeg seamless loop produced no output');
  console.log(`[jobs] seamless loop applied: ${filename} -> ${outputName} (blend=${blendFrames}, transition=${transition}, crf=${crf})`);
  return `/api/files/${outputName}`;
}

function updateJob(job: JobData) {
  job.updatedAt = Date.now();
  jobs.set(job.id, job);
  persistJobs();
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
    updateJob(existing);
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
  persistJobs();

  runPrepare(job, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Prepare failed';
    updateJob(job);
  });

  return job;
}

export function confirmJob(job: JobData, editedPrompt: string, editedModel: string, falKey: string, editedParams?: Record<string, unknown>): void {
  if (job.status !== 'prepared') return;

  const budget = checkBudget(job.userId);
  if (!budget.allowed) {
    job.status = 'error';
    job.error = `Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`;
    updateJob(job);
    return;
  }

  if (editedParams) {
    Object.assign(job.input, editedParams);
  }

  job.status = 'generating';
  updateJob(job);

  runGenerate(job, editedPrompt, editedModel, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Generation failed';
    updateJob(job);
  });
}

export function createBatchFromMatrix(
  matrix: PoseMatrix,
  userId: string,
  projectId: string,
  falKey: string,
  poseImages: Record<string, string>,
): { batchId: string; jobs: JobData[] } {
  const budget = checkBudget(userId);
  if (!budget.allowed) {
    throw new Error(`Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`);
  }

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batchJobs: JobData[] = [];
  const poseMap = new Map(matrix.poses.map(p => [p.id, p]));

  for (let i = 0; i < matrix.clips.length; i++) {
    const clip = matrix.clips[i];
    const startPose = poseMap.get(clip.startPoseId);
    const endPose = poseMap.get(clip.endPoseId);
    if (!startPose || !endPose) continue;

    const startImage = poseImages[clip.startPoseId];
    const endImage = poseImages[clip.endPoseId];
    if (!startImage || !endImage) continue;

    const isLoop = clip.startPoseId === clip.endPoseId;
    const clipPrompt = clip.prompt?.trim() || '';
    const globalPrompt = matrix.globalPrompt?.trim() || '';
    let instruction: string;
    if (globalPrompt && clipPrompt) {
      instruction = `${globalPrompt}\n\nSpecific instruction for this clip (${startPose.name} → ${endPose.name}): ${clipPrompt}`;
    } else if (clipPrompt) {
      instruction = clipPrompt;
    } else if (globalPrompt) {
      instruction = `${globalPrompt}\n\nThis is a ${isLoop ? 'loop' : 'transition'} clip: ${startPose.name} → ${endPose.name}. Generate natural movement for this pose ${isLoop ? 'hold' : 'transition'}.`;
    } else {
      instruction = `Realistic avatar ${isLoop ? 'holding pose' : 'transitioning between poses'}: ${startPose.name} → ${endPose.name}. The person should move naturally — subtle breathing, blinking, slight head movement, micro-movements of hands and body. Smooth and lifelike.`;
    }
    const input: Record<string, unknown> = {
      instruction,
      modelPref: matrix.modelId,
      duration: matrix.duration,
      aspectRatio: matrix.aspectRatio,
      quality: matrix.quality,
      fps: matrix.fps,
      strategy: 'direct',
      sourceImage: startImage,
      endImage: endImage,
      _poseMatrixId: matrix.id,
      _clipType: isLoop ? 'loop' : 'transition',
      _startPose: startPose.name,
      _endPose: endPose.name,
    };

    const job: JobData = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
      userId,
      projectId,
      type: 'video',
      status: 'generating',
      input,
      batchId,
      slotIndex: i,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    jobs.set(job.id, job);
    batchJobs.push(job);

    runGenerateThrottled(job, instruction, matrix.modelId, falKey).catch(err => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : 'Generation failed';
      updateJob(job);
    });
  }

  persistJobs();
  return { batchId, jobs: batchJobs };
}

export function createBatchJobs(
  userId: string,
  projectId: string,
  templateId: string,
  slots: TemplateSlot[],
  sharedInstruction: string,
  sharedInput: Record<string, unknown>,
  falKey: string,
): { batchId: string; jobs: JobData[] } {
  const budget = checkBudget(userId);
  if (!budget.allowed) {
    throw new Error(`Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`);
  }

  const batchId = `batch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const batchJobs: JobData[] = [];

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const instruction = slot.instruction || sharedInstruction;
    const imageRefs = slot.references.filter(r => r.type === 'image');
    const videoRefs = slot.references.filter(r => r.type === 'video');
    const audioRefs = slot.references.filter(r => r.type === 'audio');

    const input: Record<string, unknown> = {
      ...sharedInput,
      instruction,
      modelPref: slot.modelId,
      duration: slot.duration,
      aspectRatio: slot.aspectRatio,
      quality: slot.quality,
      fps: slot.fps,
      strategy: slot.strategy,
    };
    if (slot.seamlessLoop) {
      input.seamlessLoop = true;
      input.blendFrames = slot.blendFrames || 10;
      input.loopTransition = slot.loopTransition || 'fade';
      input.loopCrf = slot.loopCrf ?? 18;
    }
    if (imageRefs.length > 0) input.sourceImage = sharedInput.sourceImage || imageRefs[0].url;
    if (imageRefs.length > 1) input.endImage = imageRefs[1].url;
    if (videoRefs.length > 0) input.sourceVideo = videoRefs[0].url;
    if (audioRefs.length > 0) input.audioUrl = audioRefs[0].url;

    const job: JobData = {
      id: `job-${Date.now()}-${Math.random().toString(36).slice(2, 8)}-${i}`,
      userId,
      projectId,
      type: 'video',
      status: 'generating',
      input,
      batchId,
      slotIndex: i,
      templateId,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    jobs.set(job.id, job);
    batchJobs.push(job);

    runGenerateThrottled(job, instruction, slot.modelId, falKey).catch(err => {
      job.status = 'error';
      job.error = err instanceof Error ? err.message : 'Generation failed';
      updateJob(job);
    });
  }

  persistJobs();
  return { batchId, jobs: batchJobs };
}

export function getBatchJobs(batchId: string): JobData[] {
  const result: JobData[] = [];
  for (const job of jobs.values()) {
    if (job.batchId === batchId) result.push(job);
  }
  return result.sort((a, b) => (a.slotIndex ?? 0) - (b.slotIndex ?? 0));
}

export function retryJob(jobId: string, falKey: string): JobData | null {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'error') return null;

  job.status = 'generating';
  job.error = undefined;
  job.result = undefined;
  updateJob(job);

  const prompt = (job.input.instruction as string) || '';
  const model = (job.input.modelPref as string) || (job.input.model as string) || '';

  runGenerate(job, prompt, model, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Generation failed';
    updateJob(job);
  });

  return job;
}

const AGENT_TIMEOUT = 5 * 60 * 1000;
const MAX_RETRIES = 3;
const RETRY_DELAYS = [2000, 4000, 8000];
const MAX_CONCURRENT_GENERATE = 3;

function isRetryableError(err: Error, status?: number): boolean {
  if (err.name === 'AbortError') return false;
  if (err.message.includes('spending limit')) return false;
  if (status && status >= 400 && status < 500) return false;
  return true;
}

function extractVideoUrl(data: Record<string, unknown>): string | undefined {
  const video = data.video as { url?: string } | undefined;
  const output = data.output as { url?: string } | undefined;
  const result = data.result as { video?: { url?: string } } | undefined;
  let url = video?.url || output?.url || result?.video?.url;
  if (!url && typeof data.text === 'string') {
    const m = data.text.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov)/i);
    if (m) url = m[0];
  }
  if (!url) {
    const json = JSON.stringify(data);
    const m = json.match(/https?:\/\/[^\s"'\\]+\.(?:mp4|webm|mov)/i);
    if (m) url = m[0];
  }
  return url;
}

function validateProxiedFile(localUrl: string): void {
  if (!localUrl.startsWith('/api/files/')) return;
  const filename = localUrl.replace('/api/files/', '');
  const filePath = join(getUploadsDir(), filename);
  const stats = statSync(filePath);
  if (stats.size < 1024) {
    throw new Error(`Downloaded file too small (${stats.size} bytes) — proxy may have failed`);
  }
}

let _generateSlots = MAX_CONCURRENT_GENERATE;
const _generateQueue: Array<() => void> = [];

function acquireGenerateSlot(): Promise<void> {
  if (_generateSlots > 0) { _generateSlots--; return Promise.resolve(); }
  return new Promise(resolve => { _generateQueue.push(() => { _generateSlots--; resolve(); }); });
}

function releaseGenerateSlot(): void {
  _generateSlots++;
  const next = _generateQueue.shift();
  if (next) next();
}

async function runPrepare(job: JobData, falKey: string) {
  const res = await fetch(`${AGENT_URL}/prepare`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
    body: JSON.stringify({ ...job.input, type: job.type, falKey }),
  });
  const data = await res.json();
  if (!res.ok || data.error) throw new Error(data.error || `Agent error (${res.status})`);
  if (!data.prompt && !data.model) throw new Error('Agent returned empty result — no prompt or model selected. Check fal.ai API key validity.');

  job.prepareResult = {
    prompt: data.prompt || '',
    model: data.model || '',
    modelLabel: data.modelLabel || '',
    reasoning: data.reasoning || '',
    estimatedCost: data.estimatedCost || undefined,
    params: data.params || undefined,
  };
  job.status = 'prepared';
  updateJob(job);
}

async function fetchAgent(
  job: JobData, prompt: string, model: string, falKey: string,
): Promise<Record<string, unknown>> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AGENT_TIMEOUT);
      const res = await fetch(`${AGENT_URL}/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Service-Key': SERVICE_KEY },
        body: JSON.stringify({ ...job.input, type: job.type, instruction: prompt, model, falKey }),
        signal: controller.signal,
      });
      clearTimeout(timer);
      const data = await res.json();
      if (!res.ok || data.error) {
        const err = new Error(data.error || `Agent error (${res.status})`);
        if (!isRetryableError(err, res.status)) throw err;
        lastError = err;
      } else {
        return data as Record<string, unknown>;
      }
    } catch (e: unknown) {
      const err = e instanceof Error ? e : new Error(String(e));
      if (err.name === 'AbortError') {
        throw new Error('Agent timed out (5 min). Generation may still be running on fal.ai — try Recover.');
      }
      if (!isRetryableError(err)) throw err;
      lastError = err;
    }
    if (attempt < MAX_RETRIES - 1) {
      console.log(`[jobs] fetchAgent retry ${attempt + 1}/${MAX_RETRIES} in ${RETRY_DELAYS[attempt]}ms: ${lastError?.message}`);
      await new Promise(r => setTimeout(r, RETRY_DELAYS[attempt]));
    }
  }
  throw lastError || new Error('Agent request failed after retries');
}

async function processVideoResult(job: JobData, data: Record<string, unknown>): Promise<void> {
  const videoUrl = extractVideoUrl(data);
  const localUrl = videoUrl ? await proxyResultUrl(videoUrl) : undefined;
  if (!localUrl && !videoUrl) {
    throw new Error('Generation completed but no video URL in response');
  }
  let finalUrl = localUrl || videoUrl!;
  if (finalUrl.startsWith('/api/files/')) validateProxiedFile(finalUrl);
  if (job.input.seamlessLoop && finalUrl.startsWith('/api/files/')) {
    try {
      finalUrl = await applySeamlessLoop(finalUrl, job.input.blendFrames as number || 10, job.input.loopTransition as string || 'fade', job.input.loopCrf as number ?? 18);
    } catch (e) {
      console.error('[jobs] seamless loop post-processing failed:', e instanceof Error ? e.message : e);
    }
  }
  job.result = {
    video: { url: finalUrl },
    prompt: (data.prompt as string) || '',
    model: (data.model as string) || '',
    modelLabel: (data.modelLabel as string) || '',
    reasoning: (data.reasoning as string) || undefined,
    cost: data.cost as GenerationCost | undefined,
  };
}

async function runGenerate(job: JobData, prompt: string, model: string, falKey: string) {
  const budget = checkBudget(job.userId);
  if (!budget.allowed) {
    throw new Error(`Daily spending limit reached ($${budget.spent.toFixed(2)} / $${budget.limit.toFixed(2)}).`);
  }

  const data = await fetchAgent(job, prompt, model, falKey);

  if (data.falRequestId) {
    job.input._falRequestId = data.falRequestId;
    job.input._falModel = (data.model as string) || model;
    updateJob(job);
  }

  const costUsd = typeof (data.cost as { amount?: number })?.amount === 'number' ? (data.cost as { amount: number }).amount : 0;
  if (costUsd > 0) recordSpending(job.userId, costUsd, (data.model as string) || '', job.type);

  if (job.type === 'video') {
    await processVideoResult(job, data);
  } else {
    const rawImages: { url: string }[] = (data.images as { url: string }[]) || [];
    const images = await Promise.all(rawImages.map(async img => ({ url: await proxyResultUrl(img.url) })));
    job.result = {
      images,
      prompt: (data.prompt as string) || '',
      model: (data.model as string) || '',
      modelLabel: (data.modelLabel as string) || '',
      reasoning: (data.reasoning as string) || undefined,
      cost: data.cost as GenerationCost | undefined,
    };
  }

  job.status = 'complete';
  updateJob(job);
}

async function runGenerateThrottled(job: JobData, prompt: string, model: string, falKey: string) {
  await acquireGenerateSlot();
  try {
    await runGenerate(job, prompt, model, falKey);
  } finally {
    releaseGenerateSlot();
  }
}

async function recoverFromFal(job: JobData, requestId: string, model: string, falKey: string) {
  const statusUrl = `https://queue.fal.run/${model}/requests/${requestId}/status`;
  const responseUrl = `https://queue.fal.run/${model}/requests/${requestId}`;
  const MAX_WAIT = 5 * 60 * 1000;
  const start = Date.now();

  while (true) {
    const statusRes = await fetch(statusUrl, {
      headers: { 'Authorization': `Key ${falKey}` },
    });
    if (!statusRes.ok) throw new Error(`fal.ai status check failed (${statusRes.status})`);
    const statusData = await statusRes.json();

    if (statusData.status === 'COMPLETED') break;
    if (statusData.status === 'FAILED') throw new Error('Generation failed on fal.ai');
    if (Date.now() - start > MAX_WAIT) {
      throw new Error('Recovery timed out — generation may still be running on fal.ai');
    }
    await new Promise(r => setTimeout(r, 5000));
  }

  const resultRes = await fetch(responseUrl, {
    headers: { 'Authorization': `Key ${falKey}` },
  });
  if (!resultRes.ok) throw new Error(`fal.ai result fetch failed (${resultRes.status})`);
  const result = await resultRes.json();
  if (!result.prompt) result.prompt = (job.input.instruction as string) || '';
  if (!result.model) result.model = model;
  if (!result.modelLabel) result.modelLabel = model.split('/').pop() || model;
  await processVideoResult(job, result);
  job.status = 'complete';
  updateJob(job);
}

export async function recoverJob(jobId: string, falKey: string): Promise<JobData | null> {
  const job = jobs.get(jobId);
  if (!job || job.status !== 'error') return null;

  const requestId = job.input._falRequestId as string | undefined;
  const model = (job.input._falModel as string)
    || (job.input.modelPref as string)
    || (job.input.model as string) || '';
  if (!requestId || !model) return null;

  job.status = 'recovering';
  job.error = undefined;
  updateJob(job);

  recoverFromFal(job, requestId, model, falKey).catch(err => {
    job.status = 'error';
    job.error = err instanceof Error ? err.message : 'Recovery failed';
    updateJob(job);
  });

  return job;
}
