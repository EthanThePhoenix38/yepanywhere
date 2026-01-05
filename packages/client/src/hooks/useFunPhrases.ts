import { useCallback, useState } from "react";

const FUN_PHRASES_KEY = "yep-anywhere-fun-phrases-enabled";

function loadFunPhrasesEnabled(): boolean {
  const stored = localStorage.getItem(FUN_PHRASES_KEY);
  // Default to enabled
  if (stored === null) return true;
  return stored === "true";
}

function saveFunPhrasesEnabled(enabled: boolean) {
  localStorage.setItem(FUN_PHRASES_KEY, String(enabled));
}

/**
 * Hook to manage fun phrases preference.
 * When enabled, shows rotating fun phrases like "Cooking...", "Pondering..."
 * When disabled, just shows "Thinking..."
 */
export function useFunPhrases() {
  const [funPhrasesEnabled, setFunPhrasesEnabledState] = useState<boolean>(
    loadFunPhrasesEnabled,
  );

  const setFunPhrasesEnabled = useCallback((enabled: boolean) => {
    setFunPhrasesEnabledState(enabled);
    saveFunPhrasesEnabled(enabled);
  }, []);

  return { funPhrasesEnabled, setFunPhrasesEnabled };
}

/**
 * Get fun phrases preference without React state (for non-component code).
 */
export function getFunPhrasesEnabled(): boolean {
  return loadFunPhrasesEnabled();
}
