import { useEffect, useRef } from "react";
import { useAuth } from "../contexts/AuthContext";
import { activityBus } from "../lib/activityBus";

/**
 * Manages the activityBus SSE connection based on authentication state.
 *
 * When auth is enabled but user is not authenticated, we don't connect
 * to avoid 401 errors that can trigger the browser's basic auth prompt.
 *
 * When auth is not enabled, or user is authenticated, we connect.
 *
 * Includes visibility change handling to force reconnection when
 * the page becomes visible again (e.g., mobile phone waking from sleep).
 */
export function useActivityBusConnection(): void {
  const { isAuthenticated, authEnabled, isLoading } = useAuth();
  const lastVisibleTime = useRef<number>(Date.now());

  useEffect(() => {
    // Don't do anything while loading auth state
    if (isLoading) return;

    // Connect if auth is disabled OR user is authenticated
    const shouldConnect = !authEnabled || isAuthenticated;

    if (shouldConnect) {
      activityBus.connect();
    } else {
      activityBus.disconnect();
    }

    // Handle visibility changes to reconnect when page becomes visible
    // This helps recover from stale connections on mobile
    const handleVisibilityChange = () => {
      if (!shouldConnect) return;

      if (document.visibilityState === "visible") {
        const hiddenDuration = Date.now() - lastVisibleTime.current;
        // If hidden for more than 5 seconds, force reconnect to ensure fresh data
        if (hiddenDuration > 5000) {
          console.log(
            `[ActivityBus] Page visible after ${Math.round(hiddenDuration / 1000)}s, forcing reconnect`,
          );
          activityBus.forceReconnect();
        }
      } else {
        lastVisibleTime.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    // Disconnect on unmount
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      activityBus.disconnect();
    };
  }, [isAuthenticated, authEnabled, isLoading]);
}
