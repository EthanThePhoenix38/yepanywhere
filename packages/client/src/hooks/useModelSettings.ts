import type { EffortLevel, ThinkingOption } from "@yep-anywhere/shared";
import { useCallback, useState } from "react";
import {
  LEGACY_KEYS,
  getServerScoped,
  setServerScoped,
} from "../lib/storageKeys";

/**
 * Available model options.
 * "default" uses the CLI's default model.
 */
export type ModelOption = "default" | "sonnet" | "opus" | "haiku";

/**
 * Re-export shared types for convenience.
 */
export type { EffortLevel, ThinkingOption };

export const MODEL_OPTIONS: { value: ModelOption; label: string }[] = [
  { value: "default", label: "Default" },
  { value: "sonnet", label: "Sonnet" },
  { value: "opus", label: "Opus" },
  { value: "haiku", label: "Haiku" },
];

export const EFFORT_LEVEL_OPTIONS: {
  value: EffortLevel;
  label: string;
  description: string;
}[] = [
  { value: "low", label: "Low", description: "Fastest responses" },
  { value: "medium", label: "Medium", description: "Moderate thinking" },
  { value: "high", label: "High", description: "Deep reasoning" },
  { value: "max", label: "Max", description: "Maximum effort" },
];

function loadModel(): ModelOption {
  const stored = getServerScoped("model", LEGACY_KEYS.model);
  if (stored && ["default", "sonnet", "opus", "haiku"].includes(stored)) {
    return stored as ModelOption;
  }
  return "default";
}

function saveModel(model: ModelOption) {
  setServerScoped("model", model, LEGACY_KEYS.model);
}

/** Migration map from old thinking levels to effort levels */
const LEGACY_LEVEL_MAP: Record<string, EffortLevel> = {
  light: "low",
  medium: "medium",
  thorough: "max",
};

function loadEffortLevel(): EffortLevel {
  const stored = getServerScoped("thinkingLevel", LEGACY_KEYS.thinkingLevel);
  if (stored) {
    // Check for new effort level values
    if (["low", "medium", "high", "max"].includes(stored)) {
      return stored as EffortLevel;
    }
    // Migrate old thinking level values
    const migrated = LEGACY_LEVEL_MAP[stored];
    if (migrated) {
      saveEffortLevel(migrated);
      return migrated;
    }
  }
  return "high"; // SDK default
}

function saveEffortLevel(level: EffortLevel) {
  setServerScoped("thinkingLevel", level, LEGACY_KEYS.thinkingLevel);
}

function loadThinkingEnabled(): boolean {
  const stored = getServerScoped(
    "thinkingEnabled",
    LEGACY_KEYS.thinkingEnabled,
  );
  return stored === "true";
}

function saveThinkingEnabled(enabled: boolean) {
  setServerScoped(
    "thinkingEnabled",
    enabled ? "true" : "false",
    LEGACY_KEYS.thinkingEnabled,
  );
}

function loadVoiceInputEnabled(): boolean {
  const stored = getServerScoped(
    "voiceInputEnabled",
    LEGACY_KEYS.voiceInputEnabled,
  );
  // Default to true (enabled) if not set
  return stored !== "false";
}

function saveVoiceInputEnabled(enabled: boolean) {
  setServerScoped(
    "voiceInputEnabled",
    enabled ? "true" : "false",
    LEGACY_KEYS.voiceInputEnabled,
  );
}

/**
 * Hook to manage model and thinking preferences.
 */
export function useModelSettings() {
  const [model, setModelState] = useState<ModelOption>(loadModel);
  const [effortLevel, setEffortLevelState] =
    useState<EffortLevel>(loadEffortLevel);
  const [thinkingEnabled, setThinkingEnabledState] =
    useState<boolean>(loadThinkingEnabled);
  const [voiceInputEnabled, setVoiceInputEnabledState] = useState<boolean>(
    loadVoiceInputEnabled,
  );

  const setModel = useCallback((m: ModelOption) => {
    setModelState(m);
    saveModel(m);
  }, []);

  const setEffortLevel = useCallback((level: EffortLevel) => {
    setEffortLevelState(level);
    saveEffortLevel(level);
  }, []);

  const setThinkingEnabled = useCallback((enabled: boolean) => {
    setThinkingEnabledState(enabled);
    saveThinkingEnabled(enabled);
  }, []);

  const toggleThinking = useCallback(() => {
    const newEnabled = !thinkingEnabled;
    setThinkingEnabledState(newEnabled);
    saveThinkingEnabled(newEnabled);
  }, [thinkingEnabled]);

  const setVoiceInputEnabled = useCallback((enabled: boolean) => {
    setVoiceInputEnabledState(enabled);
    saveVoiceInputEnabled(enabled);
  }, []);

  const toggleVoiceInput = useCallback(() => {
    const newEnabled = !voiceInputEnabled;
    setVoiceInputEnabledState(newEnabled);
    saveVoiceInputEnabled(newEnabled);
  }, [voiceInputEnabled]);

  return {
    model,
    setModel,
    effortLevel,
    setEffortLevel,
    // Keep thinkingLevel as alias for backward compat with components
    thinkingLevel: effortLevel,
    setThinkingLevel: setEffortLevel,
    thinkingEnabled,
    setThinkingEnabled,
    toggleThinking,
    voiceInputEnabled,
    setVoiceInputEnabled,
    toggleVoiceInput,
  };
}

/**
 * Get model setting without React state (for non-component code).
 */
export function getModelSetting(): ModelOption {
  return loadModel();
}

/**
 * Get thinking setting as ThinkingOption (for API compatibility).
 * Returns "off" if disabled, otherwise returns the current effort level.
 */
export function getThinkingSetting(): ThinkingOption {
  const enabled = loadThinkingEnabled();
  if (!enabled) {
    return "off";
  }
  return loadEffortLevel();
}

/**
 * Get thinking enabled state without React state.
 */
export function getThinkingEnabled(): boolean {
  return loadThinkingEnabled();
}

/**
 * Set thinking enabled state without React state.
 */
export function setThinkingEnabled(enabled: boolean): void {
  saveThinkingEnabled(enabled);
}

/**
 * Get voice input enabled state without React state.
 */
export function getVoiceInputEnabled(): boolean {
  return loadVoiceInputEnabled();
}
