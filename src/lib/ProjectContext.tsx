'use client';

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { Project, AppUser } from './types';
import { getSessionUser } from './auth';

interface ProjectContextValue {
  user: AppUser | null;
  projects: Project[];
  activeProject: Project | null;
  setActiveProjectId: (id: string) => void;
  createProject: (title: string) => Promise<Project>;
  renameProject: (id: string, title: string) => Promise<void>;
  deleteProject: (id: string) => Promise<void>;
  refreshProjects: () => Promise<void>;
}

const ProjectContext = createContext<ProjectContextValue | null>(null);

const ACTIVE_KEY = 'avatar-studio-active-project';

export function ProjectProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeProject = projects.find(p => p.id === activeId) || null;

  const refreshProjects = useCallback(async () => {
    if (!user) return;
    const res = await fetch(`/api/projects?userId=${encodeURIComponent(user.userId)}`);
    const data = await res.json();
    if (Array.isArray(data)) setProjects(data);
  }, [user]);

  useEffect(() => {
    const u = getSessionUser();
    setUser(u);
  }, []);

  useEffect(() => {
    if (user) refreshProjects();
  }, [user, refreshProjects]);

  useEffect(() => {
    if (projects.length > 0 && !activeId) {
      const saved = sessionStorage.getItem(ACTIVE_KEY);
      if (saved && projects.find(p => p.id === saved)) {
        setActiveId(saved);
      } else {
        setActiveId(projects[0].id);
      }
    }
  }, [projects, activeId]);

  function setActiveProjectId(id: string) {
    setActiveId(id);
    sessionStorage.setItem(ACTIVE_KEY, id);
  }

  async function handleCreateProject(title: string): Promise<Project> {
    if (!user) throw new Error('Not authenticated');
    const res = await fetch('/api/projects', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: user.userId, title }),
    });
    const project = await res.json();
    await refreshProjects();
    setActiveProjectId(project.id);
    return project;
  }

  async function handleRenameProject(id: string, title: string) {
    await fetch('/api/projects', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId: id, title }),
    });
    await refreshProjects();
  }

  async function handleDeleteProject(id: string) {
    await fetch(`/api/projects?projectId=${id}`, { method: 'DELETE' });
    if (activeId === id) {
      setActiveId(null);
      sessionStorage.removeItem(ACTIVE_KEY);
    }
    await refreshProjects();
  }

  return (
    <ProjectContext.Provider value={{
      user,
      projects,
      activeProject,
      setActiveProjectId,
      createProject: handleCreateProject,
      renameProject: handleRenameProject,
      deleteProject: handleDeleteProject,
      refreshProjects,
    }}>
      {children}
    </ProjectContext.Provider>
  );
}

export function useProject() {
  const ctx = useContext(ProjectContext);
  if (!ctx) throw new Error('useProject must be used within ProjectProvider');
  return ctx;
}
