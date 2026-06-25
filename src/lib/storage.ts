import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { join } from 'path';
import { Project, Generation } from './types';

const DATA_DIR = process.env.DATA_DIR || join(/* turbopackIgnore: true */ process.cwd(), 'data');
const PROJECTS_FILE = join(DATA_DIR, 'projects.json');
const GENERATIONS_DIR = join(DATA_DIR, 'generations');
const UPLOADS_DIR = join(DATA_DIR, 'uploads');

function ensureDirs() {
  for (const dir of [DATA_DIR, GENERATIONS_DIR, UPLOADS_DIR]) {
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
  writeFileSync(path, JSON.stringify(data, null, 2));
  try { require('fs').unlinkSync(tmp); } catch {}
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
  // Also delete generations file
  const genFile = join(GENERATIONS_DIR, `${projectId}.json`);
  try { require('fs').unlinkSync(genFile); } catch {}
  return true;
}

function genFile(projectId: string): string {
  return join(GENERATIONS_DIR, `${projectId}.json`);
}

export function getGenerations(projectId: string, type?: 'image' | 'video'): Generation[] {
  ensureDirs();
  const all: Generation[] = readJson(genFile(projectId), []);
  const filtered = type ? all.filter(g => g.type === type) : all;
  return filtered.sort((a, b) => b.createdAt - a.createdAt);
}

export function addGeneration(gen: Generation): Generation {
  ensureDirs();
  const file = genFile(gen.projectId);
  const all: Generation[] = readJson(file, []);
  all.push(gen);
  writeJson(file, all);
  // Touch project updatedAt
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
