import { useCallback, useEffect, useRef, useState } from "react";
import { authEvents } from "../lib/authEvents";
import {
  type Subscription,
  getGlobalConnection,
  getWebSocketConnection,
  isNonRetryableError,
} from "../lib/connection";
import { FetchSSE } from "../lib/connection/FetchSSE";
import { getWebsocketTransportEnabled } from "./useDeveloperMode";

interface UseSSEOptions {
  onMessage: (data: { eventType: string; [key: string]: unknown }) => void;
  onError?: (error: Event) => void;
  onOpen?: () => void;
}

/**
 * Extract sessionId from a session stream URL like /api/sessions/{id}/stream
 */
function extractSessionId(url: string): string | null {
  const match = url.match(/\/api\/sessions\/([^/]+)\/stream/);
  return match?.[1] ?? null;
}

export function useSSE(url: string | null, options: UseSSEOptions) {
  const [connected, setConnected] = useState(false);
  const eventSourceRef = useRef<FetchSSE | null>(null);
  const wsSubscriptionRef = useRef<Subscription | null>(null);
  const lastEventIdRef = useRef<string | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const optionsRef = useRef(options);
  optionsRef.current = options;
  // Track connected URL to skip StrictMode double-mount (not reset in cleanup)
  const mountedUrlRef = useRef<string | null>(null);
  // Track if using WebSocket
  const useWebSocketRef = useRef(false);

  const connect = useCallback(() => {
    if (!url) {
      // Reset tracking when URL becomes null so we can reconnect later
      // (e.g., when status goes idle → owned again for the same session)
      mountedUrlRef.current = null;
      return;
    }

    // Don't create duplicate connections
    if (eventSourceRef.current || wsSubscriptionRef.current) return;

    // Skip StrictMode double-mount (same URL, already connected once)
    if (mountedUrlRef.current === url) return;
    mountedUrlRef.current = url;

    const sessionId = extractSessionId(url);
    if (!sessionId) {
      // Not a session stream URL
      connectSSE(url);
      return;
    }

    // Check for global connection first (remote mode with SecureConnection)
    const globalConn = getGlobalConnection();
    if (globalConn) {
      useWebSocketRef.current = true;
      connectWithConnection(sessionId, globalConn);
      return;
    }

    // Check if WebSocket transport is enabled (developer mode)
    const useWebSocket = getWebsocketTransportEnabled();
    if (useWebSocket) {
      useWebSocketRef.current = true;
      connectWebSocket(sessionId);
    } else {
      useWebSocketRef.current = false;
      connectSSE(url);
    }
  }, [url]);

  /**
   * Connect using a provided connection (for remote mode).
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
          optionsRef.current.onOpen?.();
        },
        onError: (error: Error) => {
          setConnected(false);
          optionsRef.current.onError?.(new Event("error"));

          // Don't reconnect for non-retryable errors (e.g., auth required)
          if (isNonRetryableError(error)) {
            console.warn(
              "[useSSE] Non-retryable error, not reconnecting:",
              error.message,
            );
            wsSubscriptionRef.current?.close();
            wsSubscriptionRef.current = null;
            return;
          }

          // Auto-reconnect after 2s
          wsSubscriptionRef.current?.close();
          wsSubscriptionRef.current = null;
          mountedUrlRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
        onClose: () => {
          // Connection closed cleanly (e.g., relay restart) - trigger reconnect
          setConnected(false);
          wsSubscriptionRef.current = null;
          mountedUrlRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
      };

      wsSubscriptionRef.current = connection.subscribeSession(
        sessionId,
        handlers,
        lastEventIdRef.current ?? undefined,
      );
    },
    [connect],
  );

  const connectWebSocket = useCallback(
    (sessionId: string) => {
      // Close any existing subscription before creating a new one
      if (wsSubscriptionRef.current) {
        wsSubscriptionRef.current.close();
        wsSubscriptionRef.current = null;
      }

      const connection = getWebSocketConnection();
      const handlers = {
        onEvent: (
          eventType: string,
          eventId: string | undefined,
          data: unknown,
        ) => {
          if (eventId) {
            lastEventIdRef.current = eventId;
          }
          // Route event to handler
          optionsRef.current.onMessage({
            ...(data as Record<string, unknown>),
            eventType,
          });
        },
        onOpen: () => {
          setConnected(true);
          optionsRef.current.onOpen?.();
        },
        onError: (error: Error) => {
          setConnected(false);
          // Create a synthetic error event for compatibility
          optionsRef.current.onError?.(new Event("error"));

          // Don't reconnect for non-retryable errors (e.g., auth required)
          if (isNonRetryableError(error)) {
            console.warn(
              "[useSSE] Non-retryable error, not reconnecting:",
              error.message,
            );
            wsSubscriptionRef.current?.close();
            wsSubscriptionRef.current = null;
            return;
          }

          // Auto-reconnect after 2s
          wsSubscriptionRef.current?.close();
          wsSubscriptionRef.current = null;
          mountedUrlRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
        onClose: () => {
          // Connection closed cleanly (e.g., relay restart) - trigger reconnect
          setConnected(false);
          wsSubscriptionRef.current = null;
          mountedUrlRef.current = null;
          reconnectTimeoutRef.current = setTimeout(connect, 2000);
        },
      };

      wsSubscriptionRef.current = connection.subscribeSession(
        sessionId,
        handlers,
        lastEventIdRef.current ?? undefined,
      );
    },
    [connect],
  );

  const connectSSE = useCallback(
    (url: string) => {
      // Don't connect if login is already required
      if (authEvents.loginRequired) {
        console.log("[useSSE] Skipping SSE connection - login required");
        return;
      }

      // FetchSSE handles lastEventId internally, but we pass it in the URL
      // for consistency with the existing behavior
      const fullUrl = lastEventIdRef.current
        ? `${url}?lastEventId=${lastEventIdRef.current}`
        : url;

      // Use FetchSSE instead of EventSource to detect 401 errors
      const sse = new FetchSSE(fullUrl, { autoReconnect: false });

      sse.onopen = () => {
        setConnected(true);
        optionsRef.current.onOpen?.();
      };

      // Handle named events from SSE stream
      const handleEvent = (eventType: string) => (event: MessageEvent) => {
        if (event.lastEventId) {
          lastEventIdRef.current = event.lastEventId;
        }
        // Guard against undefined data (can happen on connection errors)
        if (event.data === undefined || event.data === null) {
          return;
        }
        try {
          const data = JSON.parse(event.data);
          // Use eventType (SSE event name), not data.type (SDK message type)
          optionsRef.current.onMessage({ ...data, eventType });
        } catch {
          // Ignore malformed JSON
        }
      };

      sse.addEventListener("connected", handleEvent("connected"));
      sse.addEventListener("message", handleEvent("message"));
      sse.addEventListener("status", handleEvent("status"));
      sse.addEventListener("mode-change", handleEvent("mode-change"));
      sse.addEventListener("error", handleEvent("error"));
      sse.addEventListener("complete", handleEvent("complete"));
      sse.addEventListener("heartbeat", handleEvent("heartbeat"));
      sse.addEventListener("markdown-augment", handleEvent("markdown-augment"));
      sse.addEventListener("pending", handleEvent("pending"));
      sse.addEventListener("edit-augment", handleEvent("edit-augment"));
      sse.addEventListener("claude-login", handleEvent("claude-login"));
      sse.addEventListener(
        "session-id-changed",
        handleEvent("session-id-changed"),
      );

      sse.onerror = (error) => {
        setConnected(false);
        optionsRef.current.onError?.(new Event("error"));

        // Don't reconnect for auth errors (FetchSSE handles signaling)
        if (error.isAuthError) {
          console.log("[useSSE] Auth error, not reconnecting");
          sse.close();
          eventSourceRef.current = null;
          return;
        }

        // Auto-reconnect after 2s for other errors
        sse.close();
        eventSourceRef.current = null;
        mountedUrlRef.current = null; // Reset so reconnect isn't blocked
        reconnectTimeoutRef.current = setTimeout(connect, 2000);
      };

      eventSourceRef.current = sse;
    },
    [connect],
  );

  useEffect(() => {
    connect();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      eventSourceRef.current?.close();
      eventSourceRef.current = null;
      wsSubscriptionRef.current?.close();
      wsSubscriptionRef.current = null;
      // Reset mountedUrlRef so the next mount can connect
      // This is needed for StrictMode where cleanup runs between mounts
      mountedUrlRef.current = null;
    };
  }, [connect]);

  return { connected };
}
