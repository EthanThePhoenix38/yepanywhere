import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const DEBOUNCE_MS = 500;

export interface DraftControls {
  /** Clear input state only, keeping localStorage for failure recovery */
  clearInput: () => void;
  /** Clear both input state and localStorage (call on confirmed success) */
  clearDraft: () => void;
  /** Restore from localStorage (call on failure) */
  restoreFromStorage: () => void;
}

/**
 * Hook for persisting draft text to localStorage with debouncing.
 * Supports failure recovery by keeping localStorage until explicitly cleared.
 *
 * @param key - localStorage key for this draft (e.g., "draft-message-{sessionId}")
 * @returns [value, setValue, controls] - state-like tuple with control functions
 */
export function useDraftPersistence(
  key: string,
): [string, (value: string) => void, DraftControls] {
  const [value, setValueInternal] = useState(() => {
    try {
      return localStorage.getItem(key) ?? "";
    } catch {
      return "";
    }
  });

  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const keyRef = useRef(key);

  // Update keyRef when key changes
  useEffect(() => {
    keyRef.current = key;
  }, [key]);

  // Restore from localStorage when key changes
  useEffect(() => {
    try {
      const stored = localStorage.getItem(key);
      setValueInternal(stored ?? "");
    } catch {
      setValueInternal("");
    }
  }, [key]);

  // Debounced save to localStorage
  const setValue = useCallback((newValue: string) => {
    setValueInternal(newValue);

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      try {
        if (newValue) {
          localStorage.setItem(keyRef.current, newValue);
        } else {
          localStorage.removeItem(keyRef.current);
        }
      } catch {
        // localStorage might be full or unavailable
      }
    }, DEBOUNCE_MS);
  }, []);

  // Clear input state only (for optimistic UI on submit)
  const clearInput = useCallback(() => {
    setValueInternal("");
    // Cancel pending debounce so we don't overwrite localStorage with ""
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  // Clear both state and localStorage (for confirmed successful send)
  const clearDraft = useCallback(() => {
    setValueInternal("");
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    try {
      localStorage.removeItem(keyRef.current);
    } catch {
      // Ignore errors
    }
  }, []);

  // Restore from localStorage (for failure recovery)
  const restoreFromStorage = useCallback(() => {
    try {
      const stored = localStorage.getItem(keyRef.current);
      if (stored) {
        setValueInternal(stored);
      }
    } catch {
      // Ignore errors
    }
  }, []);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const controls = useMemo(
    () => ({ clearInput, clearDraft, restoreFromStorage }),
    [clearInput, clearDraft, restoreFromStorage],
  );

  return [value, setValue, controls];
}
