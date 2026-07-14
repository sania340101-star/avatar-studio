import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { Project, Generation, Template, ProjectCacheData, ImageFormCache, VideoFormCache, ExportSession, RegisteredUser, PoseMatrix, PosePreset } from './types';
const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data');
const PROJECTS_FILE = join(DATA_DIR, 'projects.json');
const GENERATIONS_DIR = join(DATA_DIR, 'generations');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const CACHE_DIR = join(DATA_DIR, 'cache');
const EXPORTS_FILE = join(DATA_DIR, 'exports.json');
const POSE_MATRICES_FILE = join(DATA_DIR, 'pose-matrices.json');
const SAFE_ID = /^[a-zA-Z0-9_-]+$/;
function safeId(id: string): string {
  const base = id.replace(/\.json$/, '');
  if (!SAFE_ID.test(base)) throw new Error('Invalid ID');
  return base;
}
function ensureDirs() {
  for (const dir of [DATA_DIR, GENERATIONS_DIR, UPLOADS_DIR, CACHE_DIR]) {
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  }
}
function readJson<T>(path: string, fallback: T): T {
  try {
    return JSON.parse(readFileSync(path, 'utf-8'));
  } catch {
    return fallback;
  }
}
function writeJson(path: string, data: unknown) {
  ensureDirs();
  const tmp = path + '.tmp';
  writeFileSync(tmp, JSON.stringify(data, null, 2));
  renameSync(tmp, path);
}
export function getProjects(userId: string): Project[] {
  ensureDirs();
  const all: Project[] = readJson(PROJECTS_FILE, []);
  return all.filter(p => p.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getProject(projectId: string): Project | null {
  ensureDirs();
  const all: Project[] = readJson(PROJECTS_FILE, []);
  return all.find(p => p.id === projectId) || null;
}
export function createProject(userId: string, title: string): Project {
  ensureDirs();
  const all: Project[] = readJson(PROJECTS_FILE, []);
  const project: Project = {
    id: `proj-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    userId,
    title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(project);
  writeJson(PROJECTS_FILE, all);
  return project;
}
export function updateProject(projectId: string, updates: Partial<Pick<Project, 'title'>>): Project | null {
  ensureDirs();
  const all: Project[] = readJson(PROJECTS_FILE, []);
  const idx = all.findIndex(p => p.id === projectId);
  if (idx === -1) return null;
  if (updates.title) all[idx].title = updates.title;
  all[idx].updatedAt = Date.now();
  writeJson(PROJECTS_FILE, all);
  return all[idx];
}
export function deleteProject(projectId: string): boolean {
  ensureDirs();
  const all: Project[] = readJson(PROJECTS_FILE, []);
  const idx = all.findIndex(p => p.id === projectId);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(PROJECTS_FILE, all);
  const genPath = join(GENERATIONS_DIR, `${safeId(projectId)}.json`);
  try { require('fs').unlinkSync(genPath); } catch {}
  const cachePath = join(CACHE_DIR, `${safeId(projectId)}.json`);
  try { require('fs').unlinkSync(cachePath); } catch {}
  return true;
}
function genFile(projectId: string): string {
  return join(GENERATIONS_DIR, `${safeId(projectId)}.json`);
}
export function getGenerations(projectId: string, type?: 'image' | 'video' | 'export'): Generation[] {
  ensureDirs();
  const all: Generation[] = readJson(genFile(projectId), []);
  const filtered = type ? all.filter(g => g.type === type) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}
export function getAllUserGenerations(userId: string, type?: 'image' | 'video' | 'export', limit = 200): Generation[] {
  const projects = getProjects(userId);
  const all: Generation[] = [];
  for (const p of projects) {
    all.push(...readJson<Generation[]>(genFile(p.id), []));
  }
  const filtered = type ? all.filter(g => g.type === type) : all;
  const sorted = filtered.sort((a, b) => b.createdAt - a.createdAt);
  return limit > 0 ? sorted.slice(0, limit) : sorted;
}
export function addGeneration(gen: Generation): Generation {
  ensureDirs();
  const file = genFile(gen.projectId);
  const all: Generation[] = readJson(file, []);
  all.push(gen);
  writeJson(file, all);
  const projects: Project[] = readJson(PROJECTS_FILE, []);
  const pIdx = projects.findIndex(p => p.id === gen.projectId);
  if (pIdx !== -1) {
    projects[pIdx].updatedAt = Date.now();
    writeJson(PROJECTS_FILE, projects);
  }
  return gen;
}
export function deleteGeneration(projectId: string, generationId: string): { deleted: boolean; cascadedExports: string[] } {
  ensureDirs();
  const file = genFile(projectId);
  const all: Generation[] = readJson(file, []);
  const idx = all.findIndex(g => g.id === generationId);
  if (idx === -1) return { deleted: false, cascadedExports: [] };
  const gen = all[idx];
  all.splice(idx, 1);
  writeJson(file, all);

  const cascadedExports: string[] = [];
  const sessions: ExportSession[] = readJson(EXPORTS_FILE, []);
  let sessionsChanged = false;

  if (gen.type === 'export' && gen.resultUrls?.length > 0) {
    const url = gen.resultUrls[0];
    for (const s of sessions) {
      if (!s.exports) continue;
      const before = s.exports.length;
      s.exports = s.exports.filter(v => v.url !== url);
      if (s.exports.length < before) {
        s.updatedAt = Date.now();
        sessionsChanged = true;
        cascadedExports.push(s.id);
      }
    }
  } else {
    for (let si = sessions.length - 1; si >= 0; si--) {
      const s = sessions[si];
      const before = s.clips.length;
      s.clips = s.clips.filter(c => c.generationId !== generationId);
      if (s.clips.length < before) {
        cascadedExports.push(s.id);
        if (s.clips.length === 0) {
          sessions.splice(si, 1);
        } else {
          s.updatedAt = Date.now();
        }
        sessionsChanged = true;
      }
    }
  }

  if (sessionsChanged) writeJson(EXPORTS_FILE, sessions);
  return { deleted: true, cascadedExports };
}
export function getUploadsDir(): string {
  ensureDirs();
  return UPLOADS_DIR;
}
const TEMPLATES_FILE = join(DATA_DIR, 'templates.json');
export function getTemplates(): Template[] {
  ensureDirs();
  return readJson<Template[]>(TEMPLATES_FILE, []).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getTemplate(id: string): Template | null {
  const all = getTemplates();
  return all.find(t => t.id === id) || null;
}
export function createTemplate(tmpl: Omit<Template, 'id' | 'createdAt' | 'updatedAt'>): Template {
  ensureDirs();
  const all: Template[] = readJson(TEMPLATES_FILE, []);
  const template: Template = {
    ...tmpl,
    id: `tmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(template);
  writeJson(TEMPLATES_FILE, all);
  return template;
}
export function updateTemplate(id: string, updates: Partial<Omit<Template, 'id' | 'createdAt' | 'createdBy'>>): Template | null {
  ensureDirs();
  const all: Template[] = readJson(TEMPLATES_FILE, []);
  const idx = all.findIndex(t => t.id === id);
  if (idx === -1) return null;
  Object.assign(all[idx], updates, { updatedAt: Date.now() });
  writeJson(TEMPLATES_FILE, all);
  return all[idx];
}
export function deleteTemplate(id: string): boolean {
  ensureDirs();
  const all: Template[] = readJson(TEMPLATES_FILE, []);
  const idx = all.findIndex(t => t.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(TEMPLATES_FILE, all);
  return true;
}
function cacheFile(projectId: string): string {
  return join(CACHE_DIR, `${safeId(projectId)}.json`);
}
export function getProjectCache(projectId: string, type: 'image' | 'video'): ImageFormCache | VideoFormCache | null {
  ensureDirs();
  const data: ProjectCacheData = readJson(cacheFile(projectId), { updatedAt: 0 });
  return data[type] || null;
}
export function saveProjectCache(projectId: string, type: 'image' | 'video', formData: ImageFormCache | VideoFormCache): void {
  ensureDirs();
  const file = cacheFile(projectId);
  const data: ProjectCacheData = readJson(file, { updatedAt: 0 });
  data[type] = formData as ImageFormCache & VideoFormCache;
  data.updatedAt = Date.now();
  writeJson(file, data);
}

export function getExportSessions(userId: string): ExportSession[] {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  return all.filter(s => s.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getExportSession(id: string): ExportSession | null {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  return all.find(s => s.id === id) || null;
}
export function createExportSession(session: ExportSession): ExportSession {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  all.push(session);
  writeJson(EXPORTS_FILE, all);
  return session;
}
export function updateExportSession(id: string, updates: Partial<Omit<ExportSession, 'id' | 'userId' | 'createdAt'>>): ExportSession | null {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return null;
  Object.assign(all[idx], updates, { updatedAt: Date.now() });
  writeJson(EXPORTS_FILE, all);
  return all[idx];
}
export function deleteExportSession(id: string): boolean {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(EXPORTS_FILE, all);
  return true;
}

export function deleteExportVersion(sessionId: string, versionId: string): { deleted: boolean; removedGeneration: boolean } {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  const session = all.find(s => s.id === sessionId);
  if (!session || !session.exports) return { deleted: false, removedGeneration: false };

  const version = session.exports.find(v => v.id === versionId);
  if (!version) return { deleted: false, removedGeneration: false };

  session.exports = session.exports.filter(v => v.id !== versionId);
  if (session.exports.length > 0) {
    session.exportUrl = session.exports[session.exports.length - 1].url;
  } else {
    session.exportUrl = undefined;
    session.status = 'draft';
  }
  session.updatedAt = Date.now();
  writeJson(EXPORTS_FILE, all);

  let removedGeneration = false;
  const projects: Project[] = readJson(PROJECTS_FILE, []);
  for (const p of projects) {
    if (p.userId !== session.userId) continue;
    const file = genFile(p.id);
    const gens: Generation[] = readJson(file, []);
    const before = gens.length;
    const filtered = gens.filter(g => !(g.type === 'export' && g.resultUrls?.includes(version.url)));
    if (filtered.length < before) {
      writeJson(file, filtered);
      removedGeneration = true;
    }
  }

  return { deleted: true, removedGeneration };
}

export function getExportSessionsUsingGeneration(generationId: string): ExportSession[] {
  ensureDirs();
  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  return all.filter(s => s.clips.some(c => c.generationId === generationId));
}

// --- User Registry ---
const USERS_FILE = join(DATA_DIR, 'users.json');

export function registerUser(userId: string, userName: string, email?: string): void {
  ensureDirs();
  const all: RegisteredUser[] = readJson(USERS_FILE, []);
  const idx = all.findIndex(u => u.userId === userId);
  if (idx !== -1) {
    all[idx].userName = userName;
    if (email) all[idx].email = email;
    all[idx].lastSeen = Date.now();
  } else {
    all.push({ userId, userName, email, lastSeen: Date.now() });
  }
  writeJson(USERS_FILE, all);
}

export function getRegisteredUsers(): RegisteredUser[] {
  ensureDirs();
  return readJson<RegisteredUser[]>(USERS_FILE, []).sort((a, b) => b.lastSeen - a.lastSeen);
}

// --- Share (Copy) ---
function newId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function shareProject(sourceProjectId: string, targetUserId: string): { projectId: string; generationCount: number } {
  ensureDirs();
  const source = getProject(sourceProjectId);
  if (!source) throw new Error('Project not found');

  const newProjectId = newId('proj');
  const project: Project = {
    id: newProjectId,
    userId: targetUserId,
    title: source.title,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  const all: Project[] = readJson(PROJECTS_FILE, []);
  all.push(project);
  writeJson(PROJECTS_FILE, all);

  const sourceGens: Generation[] = readJson(genFile(sourceProjectId), []);
  const copiedGens: Generation[] = sourceGens.map(g => ({
    ...g,
    id: newId('gen'),
    projectId: newProjectId,
    userId: targetUserId,
    createdAt: g.createdAt,
  }));
  if (copiedGens.length > 0) {
    writeJson(genFile(newProjectId), copiedGens);
  }

  return { projectId: newProjectId, generationCount: copiedGens.length };
}

export function shareTemplate(sourceTemplateId: string, targetUserId: string): string {
  ensureDirs();
  const source = getTemplate(sourceTemplateId);
  if (!source) throw new Error('Template not found');

  const all: Template[] = readJson(TEMPLATES_FILE, []);
  const copy: Template = {
    ...source,
    id: newId('tmpl'),
    createdBy: targetUserId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(copy);
  writeJson(TEMPLATES_FILE, all);
  return copy.id;
}

export function shareGeneration(sourceProjectId: string, generationId: string, targetUserId: string): { projectId: string; generationId: string } {
  ensureDirs();
  const sourceGens: Generation[] = readJson(genFile(sourceProjectId), []);
  const gen = sourceGens.find(g => g.id === generationId);
  if (!gen) throw new Error('Generation not found');

  const all: Project[] = readJson(PROJECTS_FILE, []);
  let sharedProject = all.find(p => p.userId === targetUserId && p.title === 'Shared with me');
  if (!sharedProject) {
    sharedProject = {
      id: newId('proj'),
      userId: targetUserId,
      title: 'Shared with me',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    all.push(sharedProject);
  } else {
    sharedProject.updatedAt = Date.now();
  }
  writeJson(PROJECTS_FILE, all);

  const newGenId = newId('gen');
  const copy: Generation = {
    ...gen,
    id: newGenId,
    projectId: sharedProject.id,
    userId: targetUserId,
  };
  const targetGens: Generation[] = readJson(genFile(sharedProject.id), []);
  targetGens.push(copy);
  writeJson(genFile(sharedProject.id), targetGens);

  return { projectId: sharedProject.id, generationId: newGenId };
}

export function shareExportSession(sourceSessionId: string, targetUserId: string): string {
  ensureDirs();
  const source = getExportSession(sourceSessionId);
  if (!source) throw new Error('Export session not found');

  const all: ExportSession[] = readJson(EXPORTS_FILE, []);
  const copy: ExportSession = {
    ...source,
    id: newId('exp'),
    userId: targetUserId,
    clips: source.clips.map(c => ({ ...c, id: newId('clip'), generationId: undefined })),
    status: 'draft',
    exportUrl: undefined,
    exports: [],
    error: undefined,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(copy);
  writeJson(EXPORTS_FILE, all);
  return copy.id;
}

// --- Pose Matrix ---
export function getPoseMatrices(userId: string): PoseMatrix[] {
  ensureDirs();
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  return all.filter(m => m.userId === userId).sort((a, b) => b.updatedAt - a.updatedAt);
}
export function getPoseMatrix(id: string): PoseMatrix | null {
  ensureDirs();
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  return all.find(m => m.id === id) || null;
}
export function createPoseMatrix(data: Omit<PoseMatrix, 'id' | 'createdAt' | 'updatedAt'>): PoseMatrix {
  ensureDirs();
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  const matrix: PoseMatrix = {
    ...data,
    id: `pm-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(matrix);
  writeJson(POSE_MATRICES_FILE, all);
  return matrix;
}
export function updatePoseMatrix(id: string, updates: Partial<Omit<PoseMatrix, 'id' | 'userId' | 'createdAt'>>): PoseMatrix | null {
  ensureDirs();
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return null;
  Object.assign(all[idx], updates, { updatedAt: Date.now() });
  writeJson(POSE_MATRICES_FILE, all);
  return all[idx];
}
export function deletePoseMatrix(id: string): boolean {
  ensureDirs();
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  const idx = all.findIndex(m => m.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(POSE_MATRICES_FILE, all);
  return true;
}
export function sharePoseMatrix(sourceId: string, targetUserId: string): string {
  ensureDirs();
  const source = getPoseMatrix(sourceId);
  if (!source) throw new Error('Pose matrix not found');
  const all: PoseMatrix[] = readJson(POSE_MATRICES_FILE, []);
  const copy: PoseMatrix = {
    ...source,
    id: newId('pm'),
    userId: targetUserId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  all.push(copy);
  writeJson(POSE_MATRICES_FILE, all);
  return copy.id;
}

const POSE_PRESETS_FILE = join(DATA_DIR, 'pose-presets.json');
export function getPosePresets(): PosePreset[] {
  ensureDirs();
  return readJson<PosePreset[]>(POSE_PRESETS_FILE, []).sort((a, b) => a.label.localeCompare(b.label));
}
export function createPosePreset(data: { label: string; value: string }): PosePreset {
  ensureDirs();
  const all: PosePreset[] = readJson(POSE_PRESETS_FILE, []);
  const preset: PosePreset = { id: newId('pp'), label: data.label, value: data.value, createdAt: Date.now(), updatedAt: Date.now() };
  all.push(preset);
  writeJson(POSE_PRESETS_FILE, all);
  return preset;
}
export function updatePosePreset(id: string, updates: Partial<Pick<PosePreset, 'label' | 'value'>>): PosePreset | null {
  ensureDirs();
  const all: PosePreset[] = readJson(POSE_PRESETS_FILE, []);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return null;
  Object.assign(all[idx], updates, { updatedAt: Date.now() });
  writeJson(POSE_PRESETS_FILE, all);
  return all[idx];
}
export function deletePosePreset(id: string): boolean {
  ensureDirs();
  const all: PosePreset[] = readJson(POSE_PRESETS_FILE, []);
  const idx = all.findIndex(p => p.id === id);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(POSE_PRESETS_FILE, all);
  return true;
}
export function seedPosePresets(defaults: { label: string; value: string }[]): void {
  ensureDirs();
  const all: PosePreset[] = readJson(POSE_PRESETS_FILE, []);
  if (all.length > 0) return;
  const seeded = defaults.map(d => ({ id: newId('pp'), label: d.label, value: d.value, createdAt: Date.now(), updatedAt: Date.now() }));
  writeJson(POSE_PRESETS_FILE, seeded);
}
