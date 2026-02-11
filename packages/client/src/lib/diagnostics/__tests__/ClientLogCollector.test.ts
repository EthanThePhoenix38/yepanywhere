import "fake-indexeddb/auto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ClientLogCollector, type LogEntry } from "../ClientLogCollector";

// Mock fetchJSON to avoid real network calls
vi.mock("../../../api/client", () => ({
  fetchJSON: vi.fn(() => Promise.resolve({ received: 0 })),
}));

// Mock connectionManager
const stateChangeListeners = new Set<(state: string, prev: string) => void>();
vi.mock("../../connection", () => ({
  connectionManager: {
    state: "disconnected",
    on: vi.fn((event: string, cb: (state: string, prev: string) => void) => {
      if (event === "stateChange") {
        stateChangeListeners.add(cb);
      }
      return () => stateChangeListeners.delete(cb);
    }),
  },
}));

import { fetchJSON } from "../../../api/client";

describe("ClientLogCollector", () => {
  let collector: ClientLogCollector;
  let origLog: typeof console.log;
  let origWarn: typeof console.warn;
  let origError: typeof console.error;

  beforeEach(() => {
    origLog = console.log;
    origWarn = console.warn;
    origError = console.error;
    stateChangeListeners.clear();
    vi.clearAllMocks();
    collector = new ClientLogCollector();
  });

  afterEach(() => {
    collector.stop();
    // Restore console just in case
    console.log = origLog;
    console.warn = origWarn;
    console.error = origError;
  });

  it("captures matching prefixed log messages", async () => {
    await collector.start();

    console.log("[ConnectionManager] connected → reconnecting");
    console.log("[SecureConnection] SRP resume sent");
    console.log("unrelated log message");

    // Give fire-and-forget writes a tick
    await new Promise((r) => setTimeout(r, 10));

    // Flush to see what was captured
    vi.mocked(fetchJSON).mockResolvedValueOnce({ received: 2 });
    await collector.flush();

    expect(fetchJSON).toHaveBeenCalledTimes(1);
    // biome-ignore lint/style/noNonNullAssertion: test assertion after expect(calledTimes(1))
    const call = vi.mocked(fetchJSON).mock.calls[0]!;
    expect(call[0]).toBe("/client-logs");
    const body = JSON.parse(call[1]?.body as string);
    expect(body.entries).toHaveLength(2);
    expect(body.entries[0].prefix).toBe("[ConnectionManager]");
    expect(body.entries[1].prefix).toBe("[SecureConnection]");
  });

  it("ignores non-matching prefixed messages", async () => {
    await collector.start();

    console.log("plain message");
    console.log("[UnknownPrefix] something");
    console.log(42); // non-string first arg

    await new Promise((r) => setTimeout(r, 10));
    await collector.flush();

    // fetchJSON should not be called (no entries to flush)
    expect(fetchJSON).not.toHaveBeenCalled();
  });

  it("captures warn and error levels", async () => {
    await collector.start();

    console.warn("[ConnectionManager] warn message");
    console.error("[ConnectionManager] error message");

    await new Promise((r) => setTimeout(r, 10));

    vi.mocked(fetchJSON).mockResolvedValueOnce({ received: 2 });
    await collector.flush();

    const body = JSON.parse(
      vi.mocked(fetchJSON).mock.calls[0]?.[1]?.body as string,
    );
    expect(body.entries[0].level).toBe("warn");
    expect(body.entries[1].level).toBe("error");
  });

  it("restores console on stop", async () => {
    await collector.start();
    expect(console.log).not.toBe(origLog);

    collector.stop();
    expect(console.log).toBe(origLog);
    expect(console.warn).toBe(origWarn);
    expect(console.error).toBe(origError);
  });

  it("passes through all log messages to original console", async () => {
    const spy = vi.fn();
    console.log = spy;

    // Create new collector after spy is set
    const c = new ClientLogCollector();
    await c.start();

    console.log("[ConnectionManager] test");
    expect(spy).toHaveBeenCalledWith("[ConnectionManager] test");

    console.log("unrelated");
    expect(spy).toHaveBeenCalledWith("unrelated");

    c.stop();
  });

  it("subscribes to stateChange and flushes on connected", async () => {
    await collector.start();

    // Log something
    console.log("[ConnectionManager] test entry");
    await new Promise((r) => setTimeout(r, 10));

    vi.mocked(fetchJSON).mockResolvedValueOnce({ received: 1 });

    // Simulate reconnect → connected
    for (const cb of stateChangeListeners) {
      cb("connected", "reconnecting");
    }

    // Wait for flush
    await new Promise((r) => setTimeout(r, 10));

    expect(fetchJSON).toHaveBeenCalledTimes(1);
  });

  it("falls back to memory buffer when IDB is unavailable", async () => {
    // Temporarily break indexedDB
    const origIDB = globalThis.indexedDB;
    Object.defineProperty(globalThis, "indexedDB", {
      value: {
        open: () => {
          throw new Error("IDB not available");
        },
      },
      writable: true,
      configurable: true,
    });

    const memCollector = new ClientLogCollector();
    await memCollector.start();

    console.log("[ConnectionManager] memory test");
    await new Promise((r) => setTimeout(r, 10));

    vi.mocked(fetchJSON).mockResolvedValueOnce({ received: 1 });
    await memCollector.flush();

    expect(fetchJSON).toHaveBeenCalledTimes(1);
    const body = JSON.parse(
      vi.mocked(fetchJSON).mock.calls[0]?.[1]?.body as string,
    );
    expect(body.entries).toHaveLength(1);
    expect(body.entries[0].message).toContain("memory test");

    memCollector.stop();

    // Restore indexedDB
    Object.defineProperty(globalThis, "indexedDB", {
      value: origIDB,
      writable: true,
      configurable: true,
    });
  });

  it("concatenates multiple arguments into message", async () => {
    await collector.start();

    console.log("[ConnectionManager] state:", "connected", { extra: true });
    await new Promise((r) => setTimeout(r, 10));

    vi.mocked(fetchJSON).mockResolvedValueOnce({ received: 1 });
    await collector.flush();

    const body = JSON.parse(
      vi.mocked(fetchJSON).mock.calls[0]?.[1]?.body as string,
    );
    expect(body.entries[0].message).toBe(
      '[ConnectionManager] state: connected {"extra":true}',
    );
  });
});
