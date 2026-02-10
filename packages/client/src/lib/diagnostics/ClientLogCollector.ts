import { fetchJSON } from "../../api/client";
import { connectionManager } from "../connection";
import {
  countEntries,
  deleteEntries,
  getAllEntries,
  openDatabase,
  putEntry,
} from "./idb";

export interface LogEntry {
  id?: number;
  timestamp: number;
  level: string;
  prefix: string;
  message: string;
}

const DB_NAME = "yep-anywhere-client-logs";
const DB_VERSION = 1;
const STORE_NAME = "entries";
const MAX_ENTRIES = 2000;
const FLUSH_BATCH_SIZE = 500;

const CAPTURED_PREFIXES = [
  "[ConnectionManager]",
  "[SecureConnection]",
  "[ActivityBus]",
  "[WebSocketConnection]",
  "[RemoteConnection]",
  "[Relay]",
  "[RelayProtocol]",
];

const PREFIX_REGEX = /^\[([A-Za-z]+)\]/;

export class ClientLogCollector {
  private _db: IDBDatabase | null = null;
  private _memoryBuffer: LogEntry[] = [];
  private _useMemoryFallback = false;
  private _started = false;
  private _flushing = false;

  private _origLog: typeof console.log | null = null;
  private _origWarn: typeof console.warn | null = null;
  private _origError: typeof console.error | null = null;
  private _unsubscribeState: (() => void) | null = null;

  /** Log using the original console.log to avoid self-capture */
  private _log(...args: unknown[]): void {
    (this._origLog ?? console.log).call(
      console,
      "[ClientLogCollector]",
      ...args,
    );
  }

  async start(): Promise<void> {
    if (this._started) return;
    this._started = true;

    try {
      this._db = await openDatabase(DB_NAME, DB_VERSION, (db) => {
        db.createObjectStore(STORE_NAME, {
          keyPath: "id",
          autoIncrement: true,
        });
      });
    } catch {
      this._useMemoryFallback = true;
    }

    this._wrapConsole();

    this._unsubscribeState = connectionManager.on("stateChange", (state) => {
      if (state === "connected") {
        this._log("stateChange → connected, flushing");
        this.flush();
      }
    });

    this._log(
      `started (db=${this._db ? "idb" : "memory"}, connState=${connectionManager.state})`,
    );

    // Flush immediately if already connected (e.g. setting enabled mid-session)
    if (connectionManager.state === "connected") {
      this.flush();
    }
  }

  stop(): void {
    if (!this._started) return;
    this._started = false;

    this._restoreConsole();

    if (this._unsubscribeState) {
      this._unsubscribeState();
      this._unsubscribeState = null;
    }

    if (this._db) {
      this._db.close();
      this._db = null;
    }

    this._memoryBuffer = [];
    this._useMemoryFallback = false;
  }

  async flush(): Promise<void> {
    if (this._flushing) return;
    this._flushing = true;
    try {
      await this._doFlush();
    } finally {
      this._flushing = false;
    }
  }

  private async _doFlush(): Promise<void> {
    let entries: LogEntry[];

    if (this._useMemoryFallback || !this._db) {
      entries = this._memoryBuffer.splice(0, FLUSH_BATCH_SIZE);
      if (entries.length === 0) {
        this._log("flush: no entries (memory)");
        return;
      }
    } else {
      entries = await getAllEntries<LogEntry>(
        this._db,
        STORE_NAME,
        FLUSH_BATCH_SIZE,
      );
      if (entries.length === 0) {
        this._log("flush: no entries (idb)");
        return;
      }
    }

    this._log(`flush: sending ${entries.length} entries`);

    try {
      await fetchJSON("/client-logs", {
        method: "POST",
        body: JSON.stringify({
          entries,
          meta: {
            userAgent: navigator.userAgent,
            connectionMode: connectionManager.state,
          },
        }),
      });

      this._log(`flush: sent ${entries.length} entries successfully`);

      // Delete flushed entries from IDB
      if (!this._useMemoryFallback && this._db) {
        const keys = entries
          .map((e) => e.id)
          .filter((id): id is number => id != null);
        if (keys.length > 0) {
          await deleteEntries(this._db, STORE_NAME, keys);
        }
      }
    } catch (err) {
      this._log("flush failed:", err);
      // If flush fails (e.g. not connected), put memory entries back
      if (this._useMemoryFallback) {
        this._memoryBuffer.unshift(...entries);
      }
    }
  }

  private _writeEntry(level: string, prefix: string, message: string): void {
    const entry: LogEntry = {
      timestamp: Date.now(),
      level,
      prefix,
      message,
    };

    if (this._useMemoryFallback || !this._db) {
      this._memoryBuffer.push(entry);
      if (this._memoryBuffer.length > MAX_ENTRIES) {
        this._memoryBuffer = this._memoryBuffer.slice(-MAX_ENTRIES);
      }
      return;
    }

    putEntry(this._db, STORE_NAME, entry).then(() => {
      this._trimEntries();
    });
  }

  private async _trimEntries(): Promise<void> {
    if (!this._db) return;
    const count = await countEntries(this._db, STORE_NAME);
    if (count <= MAX_ENTRIES) return;

    // Get the oldest entries to delete
    const excess = count - MAX_ENTRIES;
    const oldest = await getAllEntries<LogEntry>(this._db, STORE_NAME, excess);
    const keys = oldest
      .map((e) => e.id)
      .filter((id): id is number => id != null);
    if (keys.length > 0) {
      await deleteEntries(this._db, STORE_NAME, keys);
    }
  }

  private _wrapConsole(): void {
    this._origLog = console.log;
    this._origWarn = console.warn;
    this._origError = console.error;

    console.log = (...args: unknown[]) => {
      this._captureIfMatched("log", args);
      this._origLog?.apply(console, args);
    };
    console.warn = (...args: unknown[]) => {
      this._captureIfMatched("warn", args);
      this._origWarn?.apply(console, args);
    };
    console.error = (...args: unknown[]) => {
      this._captureIfMatched("error", args);
      this._origError?.apply(console, args);
    };
  }

  private _restoreConsole(): void {
    if (this._origLog) console.log = this._origLog;
    if (this._origWarn) console.warn = this._origWarn;
    if (this._origError) console.error = this._origError;
    this._origLog = null;
    this._origWarn = null;
    this._origError = null;
  }

  private _captureIfMatched(level: string, args: unknown[]): void {
    if (args.length === 0) return;
    const first = args[0];
    if (typeof first !== "string") return;

    const match = PREFIX_REGEX.exec(first);
    if (!match) return;

    const fullPrefix = `[${match[1]}]`;
    if (!CAPTURED_PREFIXES.includes(fullPrefix)) return;

    const message = args
      .map((a) => (typeof a === "string" ? a : JSON.stringify(a)))
      .join(" ");

    this._writeEntry(level, fullPrefix, message);
  }
}
