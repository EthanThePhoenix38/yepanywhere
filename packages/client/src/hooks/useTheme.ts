import { useCallback, useEffect, useState } from "react";

export type Theme = "auto" | "light" | "dark" | "verydark";

const THEME_KEY = "claude-anywhere-theme";

const themeLabels: Record<Theme, string> = {
  auto: "Auto",
  light: "Light",
  dark: "Dark",
  verydark: "Very Dark",
};

export const THEMES: Theme[] = ["auto", "light", "dark", "verydark"];

export function getThemeLabel(theme: Theme): string {
  return themeLabels[theme];
}

function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.setAttribute("data-theme", theme);
}

function loadTheme(): Theme {
  const stored = localStorage.getItem(THEME_KEY);
  if (stored && THEMES.includes(stored as Theme)) {
    return stored as Theme;
  }
  return "auto";
}

function saveTheme(theme: Theme) {
  localStorage.setItem(THEME_KEY, theme);
}

/**
 * Hook to manage theme preference.
 * Persists to localStorage and applies data-theme attribute.
 */
export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(loadTheme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    saveTheme(newTheme);
  }, []);

  return { theme, setTheme };
}

/**
 * Initialize theme on app load (call once at startup).
 * This runs before React renders to avoid flash of wrong theme.
 */
export function initializeTheme() {
  const theme = loadTheme();
  applyTheme(theme);
}

/**
 * Get current resolved theme (useful for components that need
 * to know if we're actually in light or dark mode when auto)
 */
export function getResolvedTheme(): "light" | "dark" {
  const stored = loadTheme();
  if (stored === "auto") {
    return window.matchMedia("(prefers-color-scheme: light)").matches
      ? "light"
      : "dark";
  }
  return stored === "light" ? "light" : "dark";
}
