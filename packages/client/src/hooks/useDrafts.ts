import { useCallback, useEffect, useMemo, useState } from "react";

const DRAFT_KEY_PREFIX = "draft-message-";

/**
 * Hook to track which sessions have draft messages in localStorage.
 * Listens for storage events and re-scans when sessions change.
 */
export function useDrafts(sessionIds: string[]): Set<string> {
  const [drafts, setDrafts] = useState<Set<string>>(() =>
    scanDrafts(sessionIds),
  );

  const scan = useCallback(() => {
    setDrafts(scanDrafts(sessionIds));
  }, [sessionIds]);

  // Re-scan when sessionIds change
  useEffect(() => {
    scan();
  }, [scan]);

  // Listen for storage events (changes from other tabs or same-tab updates)
  useEffect(() => {
    const handleStorage = (e: StorageEvent) => {
      if (e.key?.startsWith(DRAFT_KEY_PREFIX)) {
        scan();
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [scan]);

  // Also poll periodically for same-tab changes (storage event doesn't fire for same-tab)
  useEffect(() => {
    const interval = setInterval(scan, 1000);
    return () => clearInterval(interval);
  }, [scan]);

  return useMemo(() => drafts, [drafts]);
}

function scanDrafts(sessionIds: string[]): Set<string> {
  const result = new Set<string>();
  try {
    for (const sessionId of sessionIds) {
      const key = `${DRAFT_KEY_PREFIX}${sessionId}`;
      const value = localStorage.getItem(key);
      if (value?.trim()) {
        result.add(sessionId);
      }
    }
  } catch {
    // localStorage might be unavailable
  }
  return result;
}
