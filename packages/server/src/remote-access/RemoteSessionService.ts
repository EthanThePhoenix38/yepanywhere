/**
 * RemoteSessionService manages persistent sessions for remote access.
 *
 * When a client successfully authenticates via SRP, a session is created
 * with the derived session key. Clients can then reconnect without
 * re-entering their password by presenting the session ID and a proof
 * (encrypted timestamp) that demonstrates possession of the session key.
 *
 * Sessions expire after:
 * - 7 days of inactivity (idle timeout)
 * - 30 days total (max lifetime)
 *
 * Sessions are invalidated when:
 * - User changes password
 * - User explicitly logs out
 * - Max sessions per user is exceeded (oldest evicted)
 */

import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { decrypt } from "../crypto/nacl-wrapper.js";

/** How long a session can be idle before expiring (7 days) */
const IDLE_TIMEOUT_MS = 7 * 24 * 60 * 60 * 1000;

/** Maximum lifetime of a session (30 days) */
const MAX_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;

/** Maximum proof timestamp age (5 minutes) */
const MAX_PROOF_AGE_MS = 5 * 60 * 1000;

/** Maximum sessions per user */
const MAX_SESSIONS_PER_USER = 5;

const CURRENT_VERSION = 1;

export interface RemoteSession {
  /** Unique session identifier */
  sessionId: string;
  /** Username this session belongs to */
  username: string;
  /** Session key for encryption (base64-encoded) */
  sessionKey: string;
  /** When the session was created (ISO timestamp) */
  createdAt: string;
  /** When the session was last used (ISO timestamp) */
  lastUsed: string;
}

interface RemoteSessionsState {
  /** Schema version for future migrations */
  version: number;
  /** Active sessions indexed by sessionId */
  sessions: Record<string, RemoteSession>;
}

export interface RemoteSessionServiceOptions {
  /** Directory to store state (defaults to dataDir) */
  dataDir: string;
}

export class RemoteSessionService {
  private state: RemoteSessionsState;
  private dataDir: string;
  private filePath: string;
  private savePromise: Promise<void> | null = null;
  private pendingSave = false;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;

  constructor(options: RemoteSessionServiceOptions) {
    this.dataDir = options.dataDir;
    this.filePath = path.join(this.dataDir, "remote-sessions.json");
    this.state = { version: CURRENT_VERSION, sessions: {} };
  }

  /**
   * Initialize the service by loading state from disk and starting cleanup.
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.dataDir, { recursive: true });

      const content = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(content) as RemoteSessionsState;

      if (parsed.version === CURRENT_VERSION) {
        this.state = parsed;
      } else {
        // Future: handle migrations
        this.state = {
          version: CURRENT_VERSION,
          sessions: parsed.sessions ?? {},
        };
        await this.save();
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
        console.warn(
          "[RemoteSessionService] Failed to load state, starting fresh:",
          error,
        );
      }
      this.state = { version: CURRENT_VERSION, sessions: {} };
    }

    // Clean up expired sessions on startup
    await this.cleanupExpiredSessions();

    // Run cleanup every hour
    this.cleanupTimer = setInterval(
      () => {
        void this.cleanupExpiredSessions();
      },
      60 * 60 * 1000,
    );
  }

  /**
   * Stop the service and cleanup timer.
   */
  shutdown(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Create a new session after successful SRP authentication.
   * @param username - The authenticated username
   * @param sessionKey - The derived secretbox key (32 bytes)
   * @returns The new session ID
   */
  async createSession(
    username: string,
    sessionKey: Uint8Array,
  ): Promise<string> {
    const sessionId = randomUUID();
    const now = new Date().toISOString();

    const session: RemoteSession = {
      sessionId,
      username,
      sessionKey: Buffer.from(sessionKey).toString("base64"),
      createdAt: now,
      lastUsed: now,
    };

    this.state.sessions[sessionId] = session;

    // Enforce max sessions per user
    await this.enforceMaxSessions(username);

    await this.save();
    return sessionId;
  }

  /**
   * Look up a session by ID.
   * @returns The session if found and not expired, null otherwise
   */
  getSession(sessionId: string): RemoteSession | null {
    const session = this.state.sessions[sessionId];
    if (!session) return null;

    // Check expiration
    if (this.isExpired(session)) {
      // Don't await - let it clean up in background
      void this.deleteSession(sessionId);
      return null;
    }

    return session;
  }

  /**
   * Validate a session resume proof.
   *
   * The proof is an encrypted timestamp. We decrypt it with the stored
   * session key and verify the timestamp is recent.
   *
   * @param sessionId - The session to validate
   * @param proof - Encrypted proof (JSON: { nonce: string, ciphertext: string })
   * @returns The session if valid, null otherwise
   */
  async validateProof(
    sessionId: string,
    proof: string,
  ): Promise<RemoteSession | null> {
    const session = this.getSession(sessionId);
    if (!session) return null;

    try {
      // Parse the proof (should be JSON with nonce and ciphertext)
      const { nonce, ciphertext } = JSON.parse(proof) as {
        nonce: string;
        ciphertext: string;
      };

      // Get session key
      const sessionKey = Buffer.from(session.sessionKey, "base64");

      // Decrypt the proof
      const plaintext = decrypt(nonce, ciphertext, sessionKey);
      if (!plaintext) return null;

      // Parse timestamp
      const proofData = JSON.parse(plaintext) as { timestamp: number };
      const now = Date.now();

      // Verify timestamp is recent (within 5 minutes)
      if (Math.abs(now - proofData.timestamp) > MAX_PROOF_AGE_MS) {
        return null;
      }

      // Update last used time
      session.lastUsed = new Date().toISOString();
      await this.save();

      return session;
    } catch {
      return null;
    }
  }

  /**
   * Get the session key for a valid session.
   * @returns The 32-byte session key, or null if session not found
   */
  getSessionKey(sessionId: string): Uint8Array | null {
    const session = this.getSession(sessionId);
    if (!session) return null;
    return Buffer.from(session.sessionKey, "base64");
  }

  /**
   * Delete a specific session.
   */
  async deleteSession(sessionId: string): Promise<void> {
    if (this.state.sessions[sessionId]) {
      delete this.state.sessions[sessionId];
      await this.save();
    }
  }

  /**
   * Invalidate all sessions for a user (e.g., on password change).
   */
  async invalidateUserSessions(username: string): Promise<number> {
    let count = 0;
    for (const [sessionId, session] of Object.entries(this.state.sessions)) {
      if (session.username === username) {
        delete this.state.sessions[sessionId];
        count++;
      }
    }
    if (count > 0) {
      await this.save();
    }
    return count;
  }

  /**
   * Get count of active sessions for a user.
   */
  getSessionCount(username: string): number {
    return Object.values(this.state.sessions).filter(
      (s) => s.username === username && !this.isExpired(s),
    ).length;
  }

  /**
   * Check if a session is expired.
   */
  private isExpired(session: RemoteSession): boolean {
    const now = Date.now();
    const createdAt = new Date(session.createdAt).getTime();
    const lastUsed = new Date(session.lastUsed).getTime();

    // Check max lifetime
    if (now - createdAt > MAX_LIFETIME_MS) {
      return true;
    }

    // Check idle timeout
    if (now - lastUsed > IDLE_TIMEOUT_MS) {
      return true;
    }

    return false;
  }

  /**
   * Enforce maximum sessions per user (evict oldest).
   */
  private async enforceMaxSessions(username: string): Promise<void> {
    const userSessions = Object.values(this.state.sessions)
      .filter((s) => s.username === username)
      .sort(
        (a, b) =>
          new Date(a.lastUsed).getTime() - new Date(b.lastUsed).getTime(),
      );

    while (userSessions.length > MAX_SESSIONS_PER_USER) {
      const oldest = userSessions.shift();
      if (oldest) {
        delete this.state.sessions[oldest.sessionId];
      }
    }
  }

  /**
   * Clean up expired sessions.
   */
  private async cleanupExpiredSessions(): Promise<void> {
    let cleaned = 0;
    for (const [sessionId, session] of Object.entries(this.state.sessions)) {
      if (this.isExpired(session)) {
        delete this.state.sessions[sessionId];
        cleaned++;
      }
    }
    if (cleaned > 0) {
      console.log(
        `[RemoteSessionService] Cleaned up ${cleaned} expired sessions`,
      );
      await this.save();
    }
  }

  /**
   * Save state to disk with debouncing to avoid excessive writes.
   */
  private async save(): Promise<void> {
    if (this.savePromise) {
      this.pendingSave = true;
      return;
    }

    this.savePromise = this.doSave();
    await this.savePromise;
    this.savePromise = null;

    if (this.pendingSave) {
      this.pendingSave = false;
      await this.save();
    }
  }

  private async doSave(): Promise<void> {
    const content = JSON.stringify(this.state, null, 2);
    await fs.writeFile(this.filePath, content, "utf-8");
  }
}
