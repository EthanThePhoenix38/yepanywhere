import { useCallback, useEffect, useRef, useState } from "react";
import {
  type Subscription,
  getGlobalConnection,
  getWebSocketConnection,
  isNonRetryableError,
} from "../lib/connection";

/**
 * Time without events before considering connection stale and forcing reconnect.
 * Server sends heartbeats every 30s, so 45s gives margin for network latency.
 */
const STALE_THRESHOLD_MS = 45_000;
/** How often to check for stale connections */
const STALE_CHECK_INTERVAL_MS = 10_000;
/** How long page must be hidden before forcing reconnect on visibility change */
const VISIBILITY_RECONNECT_THRESHOLD_MS = 5_000;

interface UseSessionStreamOptions {
  onMessage: (data: { eventType: string; [key: string]: unknown }) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
}

export function useSessionStream(
  sessionId: string | null,
  options: UseSessionStreamOptions,
) {
  const [connected, setConnected] = useState(false);
  const wsSubscriptionRef = useRef<Subscription | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Track connected sessionId to skip StrictMode double-mount (not reset in cleanup)
  const mountedSessionIdRef = useRef<string | null>(null);
  // Track last event time for stale connection detection
  const lastEventTimeRef = useRef<number | null>(null);
  const staleCheckIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null,
  );
  // Track if we've received heartbeats (proves server supports them)
  const hasReceivedHeartbeatRef = useRef(false);
  // Track when page was last visible (for visibility change reconnect)
  const lastVisibleTimeRef = useRef<number>(Date.now());

  // Start periodic stale connection check
  // Only triggers if we've received heartbeats (backward compat with old servers)
  const startStaleCheck = useCallback((connectFn: () => void) => {
    if (staleCheckIntervalRef.current) return;

    staleCheckIntervalRef.current = setInterval(() => {
      // Only check if we've received heartbeats and have a lastEventTime
      if (!lastEventTimeRef.current || !hasReceivedHeartbeatRef.current) return;

      const timeSinceLastEvent = Date.now() - lastEventTimeRef.current;
      if (timeSinceLastEvent > STALE_THRESHOLD_MS) {
        console.warn(
          `[useSessionStream] Connection stale (no events in ${Math.round(timeSinceLastEvent / 1000)}s), forcing reconnect`,
        );
        // Stop the interval first to prevent multiple reconnects
        if (staleCheckIntervalRef.current) {
          clearInterval(staleCheckIntervalRef.current);
          staleCheckIntervalRef.current = null;
        }
        // Clear current connections
        if (wsSubscriptionRef.current) {
          wsSubscriptionRef.current.close();
          wsSubscriptionRef.current = null;
        }
        setConnected(false);
        mountedSessionIdRef.current = null;

        // For remote mode, force reconnect the underlying WebSocket first
        // This handles half-open sockets where readyState is OPEN but the connection is dead
        const globalConn = getGlobalConnection();
        if (globalConn?.forceReconnect) {
          globalConn
            .forceReconnect()
            .then(() => {
              reconnectTimeoutRef.current = setTimeout(connectFn, 100);
            })
            .catch((err) => {
              console.error("[useSessionStream] Force reconnect failed:", err);
              reconnectTimeoutRef.current = setTimeout(connectFn, 2000);
            });
        } else {
          // Local mode - just reconnect after short delay
          reconnectTimeoutRef.current = setTimeout(connectFn, 500);
        }
      }
    }, STALE_CHECK_INTERVAL_MS);
  }, []);

  // Stop the stale connection check
  const stopStaleCheck = useCallback(() => {
    if (staleCheckIntervalRef.current) {
      clearInterval(staleCheckIntervalRef.current);
      staleCheckIntervalRef.current = null;
    }
  }, []);

  const connect = useCallback(() => {
    if (!sessionId) {
      // Reset tracking when sessionId becomes null so we can reconnect later
      // (e.g., when status goes idle → owned again for the same session)
      mountedSessionIdRef.current = null;
      return;
    }

    // Don't create duplicate connections
    if (wsSubscriptionRef.current) return;

    // Skip StrictMode double-mount (same sessionId, already connected once)
    if (mountedSessionIdRef.current === sessionId) return;
    mountedSessionIdRef.current = sessionId;

    // Check for global connection first (remote mode with SecureConnection)
    const globalConn = getGlobalConnection();
    if (globalConn) {
      connectWithConnection(sessionId, globalConn);
      return;
    }

    // Local mode: always use WebSocket
    connectWithConnection(sessionId, getWebSocketConnection());
  }, [sessionId]);

  /**
   * Connect using a provided connection (remote or local WebSocket).
   */
  const connectWithConnection = useCallback(
    (
      sessionId: string,
      connection: {
        subscribeSession: (
          sessionId: string,
          handlers: {
            onEvent: (
              eventType: string,
              eventId: string | undefined,
              data: unknown,
            ) => void;
            onOpen?: () => void;
            onError?: (err: Error) => void;
          },
          lastEventId?: string,
        ) => Subscription;
      },
    ) => {
      // Close any existing subscription before creating a new one
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current.close();
        wsSubscriptionRef.current = null;
      }

      const handlers = {
        onEvent: (
          eventType: string,
          eventId: string | undefined,
          data: unknown,
        ) => {
          // Track last event time for stale detection
          lastEventTimeRef.current = Date.now();
          if (eventType === "heartbeat") {
            hasReceivedHeartbeatRef.current = true;
          }
          if (eventId) {
            lastEventIdRef.current = eventId;
          }
          optionsRef.current.onMessage({
            ...(data as Record<string, unknown>),
            eventType,
          });
        },
        onOpen: () => {
          setConnected(true);
          lastEventTimeRef.current = Date.now();
          startStaleCheck(connect);
          optionsRef.current.onOpen?.();
        },
        onError: (error: Error) => {
          setConnected(false);
          stopStaleCheck();
          optionsRef.current.onError?.(new Event("error"));

          // Don't reconnect for non-retryable errors (e.g., auth required)
          if (isNonRetryableError(error)) {
            console.warn(
              "[useSessionStream] Non-retryable error, not reconnecting:",
              error.message,
            );
            wsSubscriptionRef.current?.close();
            wsSubscriptionRef.current = null;
            return;
          }

          // Auto-reconnect after 2s
          wsSubscriptionRef.current?.close();
          wsSubscriptionRef.current = null;
          mountedSessionIdRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
        onClose: () => {
          // Connection closed cleanly (e.g., relay restart) - trigger reconnect
          setConnected(false);
          stopStaleCheck();
          wsSubscriptionRef.current = null;
          mountedSessionIdRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
      };

      wsSubscriptionRef.current = connection.subscribeSession(
        sessionId,
        handlers,
        lastEventIdRef.current ?? undefined,
      );
    },
    [connect, startStaleCheck, stopStaleCheck],
  );

  useEffect(() => {
    connect();

    // Handle visibility changes to force reconnect when page becomes visible
    // This is needed because WebSocket connections go stale during phone sleep
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        const hiddenDuration = Date.now() - lastVisibleTimeRef.current;
        if (hiddenDuration > VISIBILITY_RECONNECT_THRESHOLD_MS) {
          console.log(
            `[useSessionStream] Page visible after ${Math.round(hiddenDuration / 1000)}s, forcing reconnect`,
          );
          // Clear current connections
          stopStaleCheck();
          if (wsSubscriptionRef.current) {
            wsSubscriptionRef.current.close();
            wsSubscriptionRef.current = null;
          }
          setConnected(false);
          mountedSessionIdRef.current = null;

          // For remote mode, force reconnect the underlying WebSocket first
          // This handles half-open sockets where readyState is OPEN but the connection is dead
          const globalConn = getGlobalConnection();
          if (globalConn?.forceReconnect) {
            globalConn
              .forceReconnect()
              .then(() => {
                connect();
              })
              .catch((err) => {
                console.error(
                  "[useSessionStream] Force reconnect failed:",
                  err,
                );
                reconnectTimeoutRef.current = setTimeout(connect, 2000);
              });
          } else {
            // Local mode - reconnect immediately
            connect();
          }
        }
      } else {
        lastVisibleTimeRef.current = Date.now();
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      stopStaleCheck();
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      wsSubscriptionRef.current?.close();
      wsSubscriptionRef.current = null;
      // Reset mountedSessionIdRef so the next mount can connect
      // This is needed for StrictMode where cleanup runs between mounts
      mountedSessionIdRef.current = null;
    };
  }, [connect, stopStaleCheck]);

  return { connected };
}
