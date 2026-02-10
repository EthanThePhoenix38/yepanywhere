import type {
  AgentActivity,
  ContextUsage,
  PendingInputType,
  UrlProjectId,
} from "@yep-anywhere/shared";
import type { SessionStatus, SessionSummary } from "../types";
import { getGlobalConnection, isRemoteClient } from "./connection";
import { type Subscription, isNonRetryableError } from "./connection/types";

// Event types matching what the server emits
export type FileChangeType = "create" | "modify" | "delete";
export type FileType =
  | "session"
  | "agent-session"
  | "settings"
  | "credentials"
  | "telemetry"
  | "other";

export interface FileChangeEvent {
  type: "file-change";
  provider: "claude" | "gemini" | "codex";
  path: string;
  relativePath: string;
  changeType: FileChangeType;
  timestamp: string;
  fileType: FileType;
}

export interface SessionStatusEvent {
  type: "session-status-changed";
  sessionId: string;
  projectId: UrlProjectId;
  ownership: SessionStatus;
  timestamp: string;
}

export interface SessionCreatedEvent {
  type: "session-created";
  session: SessionSummary;
  timestamp: string;
}

export interface SessionSeenEvent {
  type: "session-seen";
  sessionId: string;
  timestamp: string;
  messageId?: string;
}

export interface ProcessStateEvent {
  type: "process-state-changed";
  sessionId: string;
  projectId: UrlProjectId;
  activity: AgentActivity;
  /** Type of pending input (only set when activity is "waiting-input") */
  pendingInputType?: PendingInputType;
  timestamp: string;
}

export interface SessionMetadataChangedEvent {
  type: "session-metadata-changed";
  sessionId: string;
  title?: string;
  archived?: boolean;
  starred?: boolean;
  timestamp: string;
}

/**
 * Event emitted when session content changes (title, messageCount, etc.).
 * This is different from session-metadata-changed which is for user-set metadata.
 * This event is for auto-derived values from the session JSONL file.
 */
export interface SessionUpdatedEvent {
  type: "session-updated";
  sessionId: string;
  projectId: UrlProjectId;
  /** New title (derived from first user message) */
  title?: string | null;
  /** New message count */
  messageCount?: number;
  /** Updated timestamp */
  updatedAt?: string;
  /** Context window usage from the last assistant message */
  contextUsage?: ContextUsage;
  timestamp: string;
}

// Dev mode events
export interface SourceChangeEvent {
  type: "source-change";
  target: "backend" | "frontend";
  files: string[];
  timestamp: string;
}

export interface WorkerActivityEvent {
  type: "worker-activity-changed";
  activeWorkers: number;
  queueLength: number;
  hasActiveWork: boolean;
  timestamp: string;
}

/** Event emitted when a browser tab connects to the activity stream */
export interface BrowserTabConnectedEvent {
  type: "browser-tab-connected";
  browserProfileId: string;
  connectionId: number;
  transport: "sse" | "ws";
  /** Total tabs connected for this browserProfileId */
  tabCount: number;
  /** Total tabs connected across all browser profiles */
  totalTabCount: number;
  timestamp: string;
}

/** Event emitted when a browser tab disconnects from the activity stream */
export interface BrowserTabDisconnectedEvent {
  type: "browser-tab-disconnected";
  browserProfileId: string;
  connectionId: number;
  /** Remaining tabs for this browserProfileId (0 = browser profile fully offline) */
  tabCount: number;
  /** Total tabs connected across all browser profiles */
  totalTabCount: number;
  timestamp: string;
}

// Map event names to their data types
interface ActivityEventMap {
  "file-change": FileChangeEvent;
  "session-status-changed": SessionStatusEvent;
  "session-created": SessionCreatedEvent;
  "session-updated": SessionUpdatedEvent;
  "session-seen": SessionSeenEvent;
  "process-state-changed": ProcessStateEvent;
  "session-metadata-changed": SessionMetadataChangedEvent;
  // Connection events
  "browser-tab-connected": BrowserTabConnectedEvent;
  "browser-tab-disconnected": BrowserTabDisconnectedEvent;
  // Dev mode events
  "source-change": SourceChangeEvent;
  "backend-reloaded": undefined;
  "worker-activity-changed": WorkerActivityEvent;
  reconnect: undefined;
}

export type ActivityEventType = keyof ActivityEventMap;

type Listener<T> = (data: T) => void;

const RECONNECT_DELAY_MS = 2000;
/**
 * Time without events before considering connection stale and forcing reconnect.
 * Server sends heartbeats every 30s, so 45s gives margin for network latency.
 */
const STALE_THRESHOLD_MS = 45_000;
/** How often to check for stale connections */
const STALE_CHECK_INTERVAL_MS = 10_000;

/**
 * Singleton that manages activity event subscriptions.
 * Uses WebSocket transport for both local and remote connections.
 * Hooks subscribe via on() and receive events through callbacks.
 */
class ActivityBus {
  private wsSubscription: Subscription | null = null;
  private listeners = new Map<ActivityEventType, Set<Listener<unknown>>>();
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasConnected = false;
  private _connected = false;
  private _lastEventTime: number | null = null;
  private _lastReconnectTime: number | null = null;
  private staleCheckInterval: ReturnType<typeof setInterval> | null = null;
  /** Track if we've received heartbeats (proves server supports them) */
  private hasReceivedHeartbeat = false;

  get connected(): boolean {
    return this._connected;
  }

  /** Timestamp of last received event (including heartbeats) */
  get lastEventTime(): number | null {
    return this._lastEventTime;
  }

  /** Timestamp of last reconnect attempt */
  get lastReconnectTime(): number | null {
    return this._lastReconnectTime;
  }

  /**
   * Start periodic stale connection check.
   * If no events received within STALE_THRESHOLD_MS, force reconnect.
   * Only triggers if we've received heartbeats (proves server supports them).
   */
  private startStaleCheck(): void {
    // Don't start if already running
    if (this.staleCheckInterval) return;

    this.staleCheckInterval = setInterval(() => {
      // Only check if we've received heartbeats (backward compat with old servers)
      // and we have a lastEventTime to compare against
      if (
        !this._connected ||
        !this._lastEventTime ||
        !this.hasReceivedHeartbeat
      )
        return;

      const timeSinceLastEvent = Date.now() - this._lastEventTime;
      if (timeSinceLastEvent > STALE_THRESHOLD_MS) {
        console.warn(
          `[ActivityBus] Connection stale (no events in ${Math.round(timeSinceLastEvent / 1000)}s), forcing reconnect`,
        );
        this.forceReconnect();
      }
    }, STALE_CHECK_INTERVAL_MS);
  }

  /**
   * Stop the stale connection check interval.
   */
  private stopStaleCheck(): void {
    if (this.staleCheckInterval) {
      clearInterval(this.staleCheckInterval);
      this.staleCheckInterval = null;
    }
  }

  /**
   * Connect to the activity stream. Safe to call multiple times.
   * Uses global connection (remote mode) or WebSocket (local mode).
   */
  connect(): void {
    // Check if already connected
    if (this.wsSubscription) return;

    // Check for global connection (remote mode with SecureConnection)
    const globalConn = getGlobalConnection();
    if (globalConn) {
      this.connectWithConnection(globalConn);
      return;
    }

    // In remote client mode, we MUST have a SecureConnection
    if (isRemoteClient()) {
      console.warn(
        "[ActivityBus] Remote client requires SecureConnection - not authenticated",
      );
      return;
    }

    // Local mode: always use WebSocket
    // Lazy import to avoid circular dependencies
    import("./connection").then(({ getWebSocketConnection }) => {
      // Re-check — may have connected while waiting for the import
      if (this.wsSubscription) return;
      this.connectWithConnection(getWebSocketConnection());
    });
  }

  /**
   * Connect using a provided connection (remote or local WebSocket).
   */
  private connectWithConnection(connection: {
    subscribeActivity: (handlers: {
      onEvent: (
        eventType: string,
        eventId: string | undefined,
        data: unknown,
      ) => void;
      onOpen?: () => void;
      onError?: (err: Error) => void;
      onClose?: () => void;
    }) => Subscription;
  }): void {
    this.wsSubscription = connection.subscribeActivity({
      onEvent: (eventType, _eventId, data) => {
        this.handleWsEvent(eventType, data);
      },
      onOpen: () => {
        const isReconnect = this.hasConnected;
        this.hasConnected = true;
        this._connected = true;
        this.startStaleCheck();

        if (isReconnect) {
          this.emit("reconnect", undefined);
        }
      },
      onError: (err) => {
        console.error("[ActivityBus] Connection error:", err);
        this._connected = false;
        this.wsSubscription = null;
        this.stopStaleCheck();

        // Don't reconnect for non-retryable errors (e.g., auth required)
        if (isNonRetryableError(err)) {
          console.warn(
            "[ActivityBus] Non-retryable error, not reconnecting:",
            err.message,
          );
          return;
        }

        // Auto-reconnect
        this.reconnectTimeout = setTimeout(
          () => this.connect(),
          RECONNECT_DELAY_MS,
        );
      },
      onClose: () => {
        // Connection closed cleanly (e.g., relay restart) - trigger reconnect
        console.log("[ActivityBus] Connection closed, reconnecting...");
        this._connected = false;
        this.wsSubscription = null;
        this.stopStaleCheck();
        this.reconnectTimeout = setTimeout(
          () => this.connect(),
          RECONNECT_DELAY_MS,
        );
      },
    });
  }

  /**
   * Handle events from WebSocket subscription.
   */
  private handleWsEvent(eventType: string, data: unknown): void {
    // Track last event time for all events (including heartbeats)
    this._lastEventTime = Date.now();

    // Handle special events
    if (eventType === "heartbeat") {
      this.hasReceivedHeartbeat = true;
      return;
    }
    if (eventType === "connected") {
      return;
    }

    // Emit the event to listeners
    if (this.isValidEventType(eventType)) {
      this.emit(eventType, data as ActivityEventMap[typeof eventType]);
    }
  }

  /**
   * Type guard for valid event types.
   */
  private isValidEventType(type: string): type is ActivityEventType {
    return [
      "file-change",
      "session-status-changed",
      "session-created",
      "session-updated",
      "session-seen",
      "process-state-changed",
      "session-metadata-changed",
      "browser-tab-connected",
      "browser-tab-disconnected",
      "source-change",
      "backend-reloaded",
      "worker-activity-changed",
      "reconnect",
    ].includes(type);
  }

  /**
   * Disconnect from the activity stream.
   */
  disconnect(): void {
    this.stopStaleCheck();
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.wsSubscription) {
      this.wsSubscription.close();
      this.wsSubscription = null;
    }
    this._connected = false;
  }

  /**
   * Force a reconnection by closing the current connection and reconnecting.
   * Useful when the connection may have gone stale (e.g., mobile wake from sleep).
   * For remote mode (SecureConnection), this reconnects the underlying WebSocket.
   */
  forceReconnect(): void {
    console.log(
      `[ActivityBus] Forcing reconnection... connected=${this._connected}, hasSubscription=${!!this.wsSubscription}, lastEvent=${this._lastEventTime ? `${Math.round((Date.now() - this._lastEventTime) / 1000)}s ago` : "never"}`,
    );
    this._lastReconnectTime = Date.now();

    // Clear any pending reconnect timeout
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // For remote mode with SecureConnection, force reconnect the underlying WebSocket
    const globalConn = getGlobalConnection();
    console.log(
      `[ActivityBus] globalConn=${!!globalConn}, hasForceReconnect=${!!globalConn?.forceReconnect}`,
    );
    if (globalConn?.forceReconnect) {
      this._connected = false;
      // Close our subscription (will be re-established by SecureConnection.forceReconnect)
      if (this.wsSubscription) {
        console.log("[ActivityBus] Closing existing wsSubscription");
        this.wsSubscription.close();
        this.wsSubscription = null;
      }
      // Force reconnect the underlying connection, then re-subscribe
      console.log("[ActivityBus] Calling SecureConnection.forceReconnect()");
      globalConn
        .forceReconnect()
        .then(() => {
          console.log(
            "[ActivityBus] SecureConnection.forceReconnect() resolved, calling connect()",
          );
          this.connect();
        })
        .catch((err) => {
          console.error("[ActivityBus] Force reconnect failed:", err);
          // Try to reconnect anyway after a delay
          this.reconnectTimeout = setTimeout(
            () => this.connect(),
            RECONNECT_DELAY_MS,
          );
        });
      return;
    }

    // For local WebSocket transport, just close and reconnect
    if (this.wsSubscription) {
      this.wsSubscription.close();
      this.wsSubscription = null;
    }
    this._connected = false;

    // Reconnect immediately
    this.connect();
  }

  /**
   * Subscribe to an event type. Returns an unsubscribe function.
   */
  on<K extends ActivityEventType>(
    eventType: K,
    callback: Listener<ActivityEventMap[K]>,
  ): () => void {
    let set = this.listeners.get(eventType);
    if (!set) {
      set = new Set();
      this.listeners.set(eventType, set);
    }
    set.add(callback as Listener<unknown>);

    return () => {
      set.delete(callback as Listener<unknown>);
    };
  }

  private emit<K extends ActivityEventType>(
    eventType: K,
    data: ActivityEventMap[K],
  ): void {
    const set = this.listeners.get(eventType);
    if (set) {
      for (const listener of set) {
        listener(data);
      }
    }
  }
}

export const activityBus = new ActivityBus();
