import type { DeviceInfo } from "@yep-anywhere/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api/client";

interface UseEmulatorsResult {
  emulators: DeviceInfo[];
  loading: boolean;
  error: string | null;
  startEmulator: (id: string) => Promise<void>;
  stopEmulator: (id: string) => Promise<void>;
  refresh: () => Promise<void>;
}

interface UseEmulatorsOptions {
  /** Polling interval in ms (default 5000). */
  pollIntervalMs?: number;
  /** Whether to enable polling (default true). Set false to skip API calls. */
  enabled?: boolean;
}

/** Max backoff interval when errors occur (30s). */
const MAX_BACKOFF_MS = 30_000;

/**
 * Hook to fetch and manage emulator list.
 * Polls every `pollIntervalMs` (default 5s) while active.
 * Backs off on consecutive errors to avoid flooding the server.
 */
export function useEmulators(
  options?: UseEmulatorsOptions | number,
): UseEmulatorsResult {
  const pollIntervalMs =
    typeof options === "number" ? options : (options?.pollIntervalMs ?? 5000);
  const enabled =
    typeof options === "number" ? true : (options?.enabled ?? true);
  const [emulators, setEmulators] = useState<DeviceInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const consecutiveErrorsRef = useRef(0);
  const inFlightRef = useRef(false);

  const refresh = useCallback(async () => {
    // Skip if a request is already in flight (prevents piling up)
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    try {
      const result = await api.getEmulators();
      if (mountedRef.current) {
        setEmulators(result);
        setError(null);
        consecutiveErrorsRef.current = 0;
      }
    } catch (err) {
      if (mountedRef.current) {
        consecutiveErrorsRef.current++;
        setError(err instanceof Error ? err.message : String(err));
      }
    } finally {
      inFlightRef.current = false;
      if (mountedRef.current) {
        setLoading(false);
      }
    }
  }, []);

  const startEmulator = useCallback(
    async (id: string) => {
      try {
        await api.startEmulator(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  const stopEmulator = useCallback(
    async (id: string) => {
      try {
        await api.stopEmulator(id);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    },
    [refresh],
  );

  useEffect(() => {
    if (!enabled) return;
    mountedRef.current = true;
    consecutiveErrorsRef.current = 0;
    refresh();

    // Use dynamic interval with backoff on errors
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const backoff =
        consecutiveErrorsRef.current > 0
          ? Math.min(
              pollIntervalMs * 2 ** consecutiveErrorsRef.current,
              MAX_BACKOFF_MS,
            )
          : pollIntervalMs;
      timer = setTimeout(() => {
        refresh().then(schedule);
      }, backoff);
    };
    schedule();

    return () => {
      mountedRef.current = false;
      clearTimeout(timer);
    };
  }, [refresh, pollIntervalMs, enabled]);

  return { emulators, loading, error, startEmulator, stopEmulator, refresh };
}
