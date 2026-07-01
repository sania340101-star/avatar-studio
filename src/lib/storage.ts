import { readFileSync, writeFileSync, mkdirSync, existsSync, renameSync } from 'fs';
import { join } from 'path';
import { Project, Generation, Template, ProjectCacheData, ImageFormCache, VideoFormCache } from './types';
const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data');
const PROJECTS_FILE = join(DATA_DIR, 'projects.json');
const GENERATIONS_DIR = join(DATA_DIR, 'generations');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');
const CACHE_DIR = join(DATA_DIR, 'cache');
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
export function getGenerations(projectId: string, type?: 'image' | 'video'): Generation[] {
  ensureDirs();
  const all: Generation[] = readJson(genFile(projectId), []);
  const filtered = type ? all.filter(g => g.type === type) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}
export function getAllUserGenerations(userId: string, type?: 'image' | 'video', limit = 200): Generation[] {
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
export function deleteGeneration(projectId: string, generationId: string): boolean {
  ensureDirs();
  const file = genFile(projectId);
  const all: Generation[] = readJson(file, []);
  const idx = all.findIndex(g => g.id === generationId);
  if (idx === -1) return false;
  all.splice(idx, 1);
  writeJson(file, all);
  return true;
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
