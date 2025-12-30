import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { Project } from "../types";
import { type SessionStatusEvent, useFileActivity } from "./useFileActivity";

const REFETCH_DEBOUNCE_MS = 500;

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const refetchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.getProjects();
      setProjects(data.projects);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setLoading(false);
    }
  }, []);

  // Debounced refetch for status change events
  const debouncedRefetch = useCallback(() => {
    if (refetchTimerRef.current) {
      clearTimeout(refetchTimerRef.current);
    }
    refetchTimerRef.current = setTimeout(() => {
      fetch();
    }, REFETCH_DEBOUNCE_MS);
  }, [fetch]);

  // Handle session status changes - refetch to update active counts
  const handleSessionStatusChange = useCallback(
    (_event: SessionStatusEvent) => {
      debouncedRefetch();
    },
    [debouncedRefetch],
  );

  // Subscribe to session status changes
  useFileActivity({
    onSessionStatusChange: handleSessionStatusChange,
  });

  useEffect(() => {
    fetch();
  }, [fetch]);

  // Cleanup debounce timer
  useEffect(() => {
    return () => {
      if (refetchTimerRef.current) {
        clearTimeout(refetchTimerRef.current);
      }
    };
  }, []);

  return { projects, loading, error, refetch: fetch };
}
