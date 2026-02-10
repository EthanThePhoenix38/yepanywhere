import { useCallback, useSyncExternalStore } from "react";
import { UI_KEYS } from "../lib/storageKeys";

interface DeveloperModeSettings {
  holdModeEnabled: boolean;
  /** Log relay requests/responses to console for debugging */
  relayDebugEnabled: boolean;
}

const DEFAULT_SETTINGS: DeveloperModeSettings = {
  holdModeEnabled: false,
  relayDebugEnabled: false,
};

function loadSettings(): DeveloperModeSettings {
  // Guard for SSR/test environments where localStorage may not be fully available
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.getItem !== "function"
  ) {
    return DEFAULT_SETTINGS;
  }
  const stored = localStorage.getItem(UI_KEYS.developerMode);
  if (!stored) return DEFAULT_SETTINGS;
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveSettings(settings: DeveloperModeSettings) {
  // Guard for SSR/test environments where localStorage may not be fully available
  if (
    typeof localStorage === "undefined" ||
    typeof localStorage.setItem !== "function"
  ) {
    return;
  }
  localStorage.setItem(UI_KEYS.developerMode, JSON.stringify(settings));
}

// Simple external store for cross-component sync
let currentSettings = loadSettings();
const listeners = new Set<() => void>();

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot() {
  return currentSettings;
}

function updateSettings(newSettings: DeveloperModeSettings) {
  currentSettings = newSettings;
  saveSettings(newSettings);
  for (const listener of listeners) {
    listener();
  }
}

/**
 * Hook to manage developer mode settings.
 * Settings are persisted to localStorage and synced across components.
 */
export function useDeveloperMode() {
  const settings = useSyncExternalStore(subscribe, getSnapshot);

  const setHoldModeEnabled = useCallback((enabled: boolean) => {
    updateSettings({ ...currentSettings, holdModeEnabled: enabled });
  }, []);

  const setRelayDebugEnabled = useCallback((enabled: boolean) => {
    updateSettings({ ...currentSettings, relayDebugEnabled: enabled });
  }, []);

  return {
    holdModeEnabled: settings.holdModeEnabled,
    setHoldModeEnabled,
    relayDebugEnabled: settings.relayDebugEnabled,
    setRelayDebugEnabled,
  };
}

/**
 * Get the current relay debug setting without React hooks.
 * Used by SecureConnection to check the setting synchronously.
 */
export function getRelayDebugEnabled(): boolean {
  return currentSettings.relayDebugEnabled;
}
