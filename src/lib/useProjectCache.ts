'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { ImageFormCache, VideoFormCache } from './types';

type CacheType<T extends 'image' | 'video'> = T extends 'image' ? ImageFormCache : VideoFormCache;

export function useProjectCache<T extends 'image' | 'video'>(
  projectId: string | undefined,
  type: T,
): {
  cache: CacheType<T> | null;
  loaded: boolean;
  saveCache: (data: CacheType<T>) => void;
} {
  const [cache, setCache] = useState<CacheType<T> | null>(null);
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const pendingRef = useRef<{ projectId: string; data: CacheType<T> } | null>(null);
  const currentProjectRef = useRef<string>(undefined);

  useEffect(() => {
    if (!projectId) { setLoaded(true); return; }

    if (pendingRef.current && pendingRef.current.projectId !== projectId) {
      clearTimeout(saveTimerRef.current);
      const { projectId: oldPid, data } = pendingRef.current;
      fetch('/api/project-cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: oldPid, type, data }),
      });
      pendingRef.current = null;
    }

    currentProjectRef.current = projectId;
    setLoaded(false);
    setCache(null);

    fetch(`/api/project-cache?projectId=${projectId}&type=${type}`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (currentProjectRef.current === projectId) {
          setCache(data);
          setLoaded(true);
        }
      })
      .catch(() => {
        if (currentProjectRef.current === projectId) setLoaded(true);
      });
  }, [projectId, type]);

  const saveCache = useCallback((data: CacheType<T>) => {
    if (!projectId) return;
    pendingRef.current = { projectId, data };
    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      fetch('/api/project-cache', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, type, data }),
      });
    }, 800);
  }, [projectId, type]);

  useEffect(() => {
    const flush = () => {
      if (pendingRef.current) {
        const { projectId: pid, data } = pendingRef.current;
        fetch('/api/project-cache', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId: pid, type, data }),
          keepalive: true,
        });
      }
    };
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      clearTimeout(saveTimerRef.current);
      flush();
    };
  }, [type]);

  return { cache, loaded, saveCache };
}
