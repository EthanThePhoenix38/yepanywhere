import { useCallback, useState } from "react";
import { UI_KEYS } from "../lib/storageKeys";

export type EmulatorQuality = "high" | "medium" | "low";

export const EMULATOR_FPS_OPTIONS = [15, 24, 30] as const;
export type EmulatorFps = (typeof EMULATOR_FPS_OPTIONS)[number];

export const EMULATOR_WIDTH_OPTIONS = [360, 540, 720] as const;
export type EmulatorWidth = (typeof EMULATOR_WIDTH_OPTIONS)[number];

const QUALITY_LABELS: Record<EmulatorQuality, string> = {
  high: "High",
  medium: "Medium",
  low: "Low",
};

/** Map quality label to x264 CRF value (lower = better quality / higher bitrate). */
export const QUALITY_TO_CRF: Record<EmulatorQuality, number> = {
  high: 23,
  medium: 30,
  low: 35,
};

export function getQualityLabel(q: EmulatorQuality): string {
  return QUALITY_LABELS[q];
}

function loadFps(): EmulatorFps {
  const v = parseInt(localStorage.getItem(UI_KEYS.emulatorMaxFps) ?? "", 10);
  return (EMULATOR_FPS_OPTIONS as readonly number[]).includes(v)
    ? (v as EmulatorFps)
    : 30;
}

function loadWidth(): EmulatorWidth {
  const v = parseInt(localStorage.getItem(UI_KEYS.emulatorMaxWidth) ?? "", 10);
  return (EMULATOR_WIDTH_OPTIONS as readonly number[]).includes(v)
    ? (v as EmulatorWidth)
    : 720;
}

function loadQuality(): EmulatorQuality {
  const v = localStorage.getItem(UI_KEYS.emulatorQuality);
  if (v === "high" || v === "medium" || v === "low") return v;
  return "medium";
}

/** Hook to read and persist emulator stream quality settings. */
export function useEmulatorSettings() {
  const [maxFps, setMaxFpsState] = useState<EmulatorFps>(loadFps);
  const [maxWidth, setMaxWidthState] = useState<EmulatorWidth>(loadWidth);
  const [quality, setQualityState] = useState<EmulatorQuality>(loadQuality);

  const setMaxFps = useCallback((fps: EmulatorFps) => {
    setMaxFpsState(fps);
    localStorage.setItem(UI_KEYS.emulatorMaxFps, String(fps));
  }, []);

  const setMaxWidth = useCallback((width: EmulatorWidth) => {
    setMaxWidthState(width);
    localStorage.setItem(UI_KEYS.emulatorMaxWidth, String(width));
  }, []);

  const setQuality = useCallback((q: EmulatorQuality) => {
    setQualityState(q);
    localStorage.setItem(UI_KEYS.emulatorQuality, q);
  }, []);

  return { maxFps, setMaxFps, maxWidth, setMaxWidth, quality, setQuality };
}

/** Read current emulator settings without React state (for use in connect()). */
export function getEmulatorSettings(): {
  maxFps: EmulatorFps;
  maxWidth: EmulatorWidth;
  quality: EmulatorQuality;
} {
  return { maxFps: loadFps(), maxWidth: loadWidth(), quality: loadQuality() };
}
