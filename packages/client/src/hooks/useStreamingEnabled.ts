import { useCallback, useState } from "react";

const STREAMING_KEY = "claude-anywhere-streaming-enabled";

function loadStreamingEnabled(): boolean {
  const stored = localStorage.getItem(STREAMING_KEY);
  // Default to enabled
  if (stored === null) return true;
  return stored === "true";
}

function saveStreamingEnabled(enabled: boolean) {
  localStorage.setItem(STREAMING_KEY, String(enabled));
}

/**
 * Hook to manage streaming preference.
 * When enabled, assistant responses stream in token-by-token.
 * When disabled, responses appear all at once when complete.
 */
export function useStreamingEnabled() {
  const [streamingEnabled, setStreamingEnabledState] =
    useState<boolean>(loadStreamingEnabled);

  const setStreamingEnabled = useCallback((enabled: boolean) => {
    setStreamingEnabledState(enabled);
    saveStreamingEnabled(enabled);
  }, []);

  return { streamingEnabled, setStreamingEnabled };
}

/**
 * Get streaming preference without React state (for non-component code).
 */
export function getStreamingEnabled(): boolean {
  return loadStreamingEnabled();
}
