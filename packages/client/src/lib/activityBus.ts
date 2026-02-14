import type {
  AgentActivity,
  ContextUsage,
  PendingInputType,
  UrlProjectId,
} from "@yep-anywhere/shared";
import type { SessionStatus, SessionSummary } from "../types";
import {
  connectionManager,
  getGlobalConnection,
  getWebSocketConnection,
  isRemoteClient,
} from "./connection";
import type { Subscription } from "./connection/types";

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
  /** Resolved model name (e.g., "claude-sonnet-4-5-20250929") */
  model?: string;
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
  transport: "ws";
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
  refresh: undefined;
}

export type ActivityEventType = keyof ActivityEventMap;

type Listener<T> = (data: T) => void;

/**
 * Singleton that manages activity event subscriptions.
 * Uses WebSocket transport for both local and remote connections.
 * Hooks subscribe via on() and receive events through callbacks.
 *
 * Reconnection is delegated to ConnectionManager. This class only
 * reports events in (recordEvent/recordHeartbeat/markConnected/handleError/handleClose)
 * and reacts to state changes out (re-subscribe on 'connected').
 */
class ActivityBus {
  private wsSubscription: Subscription | null = null;
  private listeners = new Map<ActivityEventType, Set<Listener<unknown>>>();
  private hasConnected = false;
  private _connected = false;
  private _connectionManagerStarted = false;
  private _stateChangeUnsub: (() => void) | null = null;
  private _visibilityRestoredUnsub: (() => void) | null = null;

  get connected(): boolean {
    return this._connected;
  }

  /**
   * Connect to the activity stream. Safe to call multiple times.
   * Uses global connection (remote mode) or WebSocket (local mode).
   *
   * Initializes ConnectionManager on first call with the appropriate reconnectFn.
   */
  connect(): void {
    // Check if already connected
    if (this.wsSubscription) return;

    // Start ConnectionManager once (idempotent)
    if (!this._connectionManagerStarted) {
      this._connectionManagerStarted = true;

      const sendPing = (id: string): void => {
        const globalConn = getGlobalConnection();
        if (globalConn && "sendPing" in globalConn) {
          (globalConn as { sendPing: (id: string) => void }).sendPing(id);
        } else {
          getWebSocketConnection().sendPing(id);
        }
      };

      const label = getGlobalConnection() ? "relay" : "ws";
      connectionManager.start(
        async () => {
          const globalConn = getGlobalConnection();
          if (globalConn?.forceReconnect) {
            await globalConn.forceReconnect();
          } else {
            await getWebSocketConnection().reconnect();
          }
        },
        { sendPing, label },
      );

      // Listen for ConnectionManager state changes to re-subscribe
      this._stateChangeUnsub = connectionManager.on("stateChange", (state) => {
        if (state === "connected" && !this.wsSubscription) {
          this.connect();
        }
      });

      // On visibility restore, emit refresh so hooks can fetch fresh data
      this._visibilityRestoredUnsub = connectionManager.on(
        "visibilityRestored",
        () => {
          if (this._connected) {
            this.emit("refresh", undefined);
          }
        },
      );
    }

    // Check for global connection (remote mode with SecureConnection)
    const globalConn = getGlobalConnection();
    if (globalConn) {
      if ("setOnPong" in globalConn) {
        (
          globalConn as { setOnPong: (cb: (id: string) => void) => void }
        ).setOnPong((id) => connectionManager.receivePong(id));
      }
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

    // Local mode: use WebSocket
    const wsConn = getWebSocketConnection();
    wsConn.setOnPong((id) => connectionManager.receivePong(id));
    this.connectWithConnection(wsConn);
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
      onClose?: (error?: Error) => void;
    }) => Subscription;
  }): void {
    this.wsSubscription = connection.subscribeActivity({
      onEvent: (eventType, _eventId, data) => {
        connectionManager.recordEvent();
        this.handleWsEvent(eventType, data);
      },
      onOpen: () => {
        connectionManager.markConnected();
        this._connected = true;

        if (this.hasConnected) {
          this.emit("reconnect", undefined);
        }
        this.hasConnected = true;
      },
      onError: (err) => {
        console.error("[ActivityBus] Connection error:", err);
        this._connected = false;
        this.wsSubscription = null;
        connectionManager.handleError(err);
      },
      onClose: (error?: Error) => {
        this._connected = false;
        this.wsSubscription = null;
        connectionManager.handleClose(error);
      },
    });
  }

  /**
   * Handle events from WebSocket subscription.
   */
  private handleWsEvent(eventType: string, data: unknown): void {
    if (eventType === "heartbeat") {
      connectionManager.recordHeartbeat();
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
      "refresh",
    ].includes(type);
  }

  /**
   * Disconnect from the activity stream.
   */
  disconnect(): void {
    if (this.wsSubscription) {
      this.wsSubscription.close();
      this.wsSubscription = null;
    }
    this._visibilityRestoredUnsub?.();
    this._visibilityRestoredUnsub = null;
    this._connected = false;
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
