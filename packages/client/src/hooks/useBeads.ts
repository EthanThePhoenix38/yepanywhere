import { useCallback, useEffect, useRef, useState } from "react";
import { type BeadsIssue, api } from "../api/client";

export interface BeadsStatus {
  installed: boolean;
  initialized: boolean;
  totalIssues?: number;
  openCount?: number;
  closedCount?: number;
  readyCount?: number;
}

/**
 * Hook to check if beads is available (installed and initialized) for a project.
 * Pass null/undefined projectId to skip fetching.
 */
export function useBeadsStatus(projectId: string | null | undefined) {
  const [status, setStatus] = useState<BeadsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!projectId) {
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBeadsStatus(projectId);
      setStatus(data);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  // Fetch when projectId changes
  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      lastProjectIdRef.current = projectId ?? null;
      fetch();
    }
  }, [projectId, fetch]);

  return { status, loading, error, refetch: fetch };
}

/**
 * Hook to get beads issues list for a project.
 * Pass null/undefined projectId to skip fetching.
 */
export function useBeadsList(projectId: string | null | undefined) {
  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [status, setStatus] = useState<BeadsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!projectId) {
      setIssues([]);
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBeadsList(projectId);
      setIssues(data.issues);
      setStatus({
        installed: data.status.installed,
        initialized: data.status.initialized,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      lastProjectIdRef.current = projectId ?? null;
      fetch();
    }
  }, [projectId, fetch]);

  return { issues, status, loading, error, refetch: fetch };
}

/**
 * Hook to get ready beads issues (no blockers) for a project.
 * Pass null/undefined projectId to skip fetching.
 */
export function useBeadsReady(projectId: string | null | undefined) {
  const [issues, setIssues] = useState<BeadsIssue[]>([]);
  const [status, setStatus] = useState<BeadsStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const lastProjectIdRef = useRef<string | null>(null);

  const fetch = useCallback(async () => {
    if (!projectId) {
      setIssues([]);
      setStatus(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await api.getBeadsReady(projectId);
      setIssues(data.issues);
      setStatus({
        installed: data.status.installed,
        initialized: data.status.initialized,
      });
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (projectId !== lastProjectIdRef.current) {
      lastProjectIdRef.current = projectId ?? null;
      fetch();
    }
  }, [projectId, fetch]);

  return { issues, status, loading, error, refetch: fetch };
}
