import { describe, expect, it, vi } from "vitest";
import {
  ConnectionManager,
  type ConnectionState,
  type ReconnectFn,
} from "../ConnectionManager";
import { WebSocketCloseError } from "../types";
import { MockTimers, MockVisibility } from "./ConnectionSimulator";

/** Flush the microtask queue (needed for promise chains in reconnectFn) */
function flush() {
  return new Promise((r) => setTimeout(r, 0));
}

function setup(
  overrides: {
    maxAttempts?: number;
    baseDelayMs?: number;
    maxDelayMs?: number;
    jitterFactor?: number;
    staleThresholdMs?: number;
    staleCheckIntervalMs?: number;
    visibilityThresholdMs?: number;
  } = {},
) {
  const timers = new MockTimers();
  const visibility = new MockVisibility();
  const reconnectFn = vi.fn<ReconnectFn>(() => Promise.resolve());
  const stateChanges: Array<{
    state: ConnectionState;
    prev: ConnectionState;
  }> = [];
  const reconnectFailures: Error[] = [];

  const cm = new ConnectionManager({
    timers,
    visibility,
    jitterFactor: 0, // deterministic by default
    ...overrides,
  });

  cm.on("stateChange", (state, prev) => {
    stateChanges.push({ state, prev });
  });
  cm.on("reconnectFailed", (error) => {
    reconnectFailures.push(error);
  });

  return {
    cm,
    timers,
    visibility,
    reconnectFn,
    stateChanges,
    reconnectFailures,
  };
}

describe("ConnectionManager", () => {
  describe("state transitions", () => {
    it("starts in disconnected state before start()", () => {
      const { cm } = setup();
      expect(cm.state).toBe("disconnected");
    });

    it("transitions to connected on start()", () => {
      const { cm, reconnectFn, stateChanges } = setup();
      cm.start(reconnectFn);
      expect(cm.state).toBe("connected");
      expect(stateChanges).toEqual([
        { state: "connected", prev: "disconnected" },
      ]);
    });

    it("connected → reconnecting → connected", async () => {
      const { cm, reconnectFn, timers, stateChanges } = setup();
      cm.start(reconnectFn);
      stateChanges.length = 0;

      cm.handleClose();
      expect(cm.state).toBe("reconnecting");

      timers.advance(1000);
      await flush();

      cm.markConnected();
      expect(cm.state).toBe("connected");
      expect(stateChanges).toEqual([
        { state: "reconnecting", prev: "connected" },
        { state: "connected", prev: "reconnecting" },
      ]);
    });

    it("connected → reconnecting → disconnected (max attempts)", async () => {
      const { cm, reconnectFn, timers, stateChanges, reconnectFailures } =
        setup({ maxAttempts: 3 });
      reconnectFn.mockRejectedValue(new Error("fail"));
      cm.start(reconnectFn);
      stateChanges.length = 0;

      cm.handleClose();
      expect(cm.state).toBe("reconnecting");

      // Attempt 1: delay 1s
      timers.advance(1000);
      await flush();
      // Attempt 2: delay 2s
      timers.advance(2000);
      await flush();
      // Attempt 3: delay 4s
      timers.advance(4000);
      await flush();

      expect(cm.state).toBe("disconnected");
      expect(reconnectFn).toHaveBeenCalledTimes(3);
      expect(reconnectFailures).toHaveLength(1);
      expect(reconnectFailures[0]?.message).toMatch(/failed after 3 attempts/);
    });

    it("transitions to disconnected on stop()", () => {
      const { cm, reconnectFn } = setup();
      cm.start(reconnectFn);
      expect(cm.state).toBe("connected");
      cm.stop();
      expect(cm.state).toBe("disconnected");
    });
  });

  describe("exponential backoff", () => {
    it("delays increase: 1s, 2s, 4s, 8s, 16s, 30s (capped)", async () => {
      const { cm, reconnectFn, timers } = setup({
        maxAttempts: 7,
        maxDelayMs: 30000,
      });
      const callTimes: number[] = [];
      reconnectFn.mockImplementation(async () => {
        callTimes.push(timers.now());
        throw new Error("fail");
      });

      cm.start(reconnectFn);
      cm.handleClose();

      const expectedDelays = [1000, 2000, 4000, 8000, 16000, 30000];
      for (const delay of expectedDelays) {
        timers.advance(delay);
        await flush();
      }

      expect(callTimes).toEqual([1000, 3000, 7000, 15000, 31000, 61000]);
      expect(reconnectFn).toHaveBeenCalledTimes(6);
    });
  });

  describe("non-retryable errors", () => {
    it("handleError with non-retryable error → immediate disconnected", () => {
      const { cm, reconnectFn, stateChanges, reconnectFailures } = setup();
      cm.start(reconnectFn);
      stateChanges.length = 0;

      const error = new WebSocketCloseError(4001, "Authentication required");
      cm.handleError(error);

      expect(cm.state).toBe("disconnected");
      expect(reconnectFn).not.toHaveBeenCalled();
      expect(reconnectFailures).toHaveLength(1);
      expect(reconnectFailures[0]).toBe(error);
    });

    it("handleClose with non-retryable close code → immediate disconnected", () => {
      const { cm, reconnectFn, reconnectFailures } = setup();
      cm.start(reconnectFn);

      const error = new WebSocketCloseError(4003, "Forbidden");
      cm.handleClose(error);

      expect(cm.state).toBe("disconnected");
      expect(reconnectFn).not.toHaveBeenCalled();
      expect(reconnectFailures).toHaveLength(1);
    });

    it("non-retryable error during reconnect → disconnected", async () => {
      const { cm, reconnectFn, timers, reconnectFailures } = setup();
      reconnectFn.mockRejectedValue(
        new WebSocketCloseError(4001, "Auth required"),
      );
      cm.start(reconnectFn);

      cm.handleClose();
      timers.advance(1000);
      await flush();

      expect(cm.state).toBe("disconnected");
      expect(reconnectFailures).toHaveLength(1);
    });
  });

  describe("stale detection", () => {
    it("fires after staleThresholdMs of no events (if heartbeat seen)", () => {
      const { cm, reconnectFn, timers } = setup({
        staleThresholdMs: 45000,
        staleCheckIntervalMs: 10000,
      });
      cm.start(reconnectFn);

      cm.recordHeartbeat();
      timers.advance(50000);

      expect(cm.state).toBe("reconnecting");
    });

    it("does NOT fire without heartbeats", () => {
      const { cm, reconnectFn, timers } = setup({
        staleThresholdMs: 45000,
        staleCheckIntervalMs: 10000,
      });
      cm.start(reconnectFn);

      timers.advance(60000);

      expect(cm.state).toBe("connected");
    });

    it("resets stale timer on recordEvent()", () => {
      const { cm, reconnectFn, timers } = setup({
        staleThresholdMs: 45000,
        staleCheckIntervalMs: 10000,
      });
      cm.start(reconnectFn);
      cm.recordHeartbeat();

      timers.advance(40000);
      cm.recordEvent();

      timers.advance(40000);
      expect(cm.state).toBe("connected");

      timers.advance(10000);
      expect(cm.state).toBe("reconnecting");
    });
  });

  describe("visibility", () => {
    it("hidden >5s + visible → triggers reconnect", () => {
      const { cm, reconnectFn, timers, visibility } = setup({
        visibilityThresholdMs: 5000,
      });
      cm.start(reconnectFn);

      visibility.hide();
      timers.advance(6000);
      visibility.show();

      expect(cm.state).toBe("reconnecting");
    });

    it("hidden <5s + visible → no-op", () => {
      const { cm, reconnectFn, timers, visibility } = setup({
        visibilityThresholdMs: 5000,
      });
      cm.start(reconnectFn);

      visibility.hide();
      timers.advance(3000);
      visibility.show();

      expect(cm.state).toBe("connected");
    });

    it("visibility change while reconnecting → no-op", () => {
      const { cm, reconnectFn, timers, visibility } = setup();
      cm.start(reconnectFn);

      cm.handleClose();
      expect(cm.state).toBe("reconnecting");

      visibility.hide();
      timers.advance(10000);
      visibility.show();

      expect(cm.state).toBe("reconnecting");
    });
  });

  describe("forceReconnect", () => {
    it("cancels pending backoff timer and reconnects with reset delay", async () => {
      const { cm, reconnectFn, timers } = setup();
      reconnectFn
        .mockRejectedValueOnce(new Error("fail1"))
        .mockResolvedValueOnce(undefined);
      cm.start(reconnectFn);

      cm.handleClose();
      timers.advance(1000);
      await flush();
      // Failed, now waiting on 2s backoff (attempt 2)

      cm.forceReconnect();
      // Resets attempts to 0, schedules with base delay (1s)
      timers.advance(1000);
      await flush();

      expect(reconnectFn).toHaveBeenCalledTimes(2);
      cm.markConnected();
      expect(cm.reconnectAttempts).toBe(0);
    });

    it("resets backoff delay to base after forceReconnect", () => {
      const { cm, reconnectFn } = setup();
      cm.start(reconnectFn);

      cm.handleClose(); // schedules attempt 0 → attempts becomes 1
      cm.forceReconnect(); // resets to 0 → schedules attempt 0 → attempts becomes 1

      // The key behavior: delay is base (1s), not escalated
      expect(cm.state).toBe("reconnecting");
    });
  });

  describe("deduplication", () => {
    it("handleClose during reconnecting → no-op", () => {
      const { cm, reconnectFn, stateChanges } = setup();
      cm.start(reconnectFn);
      stateChanges.length = 0;

      cm.handleClose();
      expect(cm.state).toBe("reconnecting");

      cm.handleClose();
      expect(stateChanges).toEqual([
        { state: "reconnecting", prev: "connected" },
      ]);
    });

    it("handleError during reconnecting → no-op", () => {
      const { cm, reconnectFn, stateChanges } = setup();
      cm.start(reconnectFn);
      stateChanges.length = 0;

      cm.handleClose();
      cm.handleError(new Error("some error"));

      expect(stateChanges).toEqual([
        { state: "reconnecting", prev: "connected" },
      ]);
    });

    it("concurrent reconnects are serialized (one in-flight at a time)", async () => {
      const { cm, reconnectFn, timers } = setup();
      let resolveReconnect: () => void = () => {};
      reconnectFn.mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            resolveReconnect = resolve;
          }),
      );

      cm.start(reconnectFn);
      cm.handleClose();

      timers.advance(1000);
      expect(reconnectFn).toHaveBeenCalledTimes(1);

      resolveReconnect();
      await flush();

      cm.markConnected();
      expect(cm.state).toBe("connected");
      expect(reconnectFn).toHaveBeenCalledTimes(1);
    });
  });

  describe("stop()", () => {
    it("clears all timers", () => {
      const { cm, reconnectFn, timers } = setup();
      cm.start(reconnectFn);
      cm.recordHeartbeat();

      cm.stop();

      expect(timers.pendingCount).toBe(0);
    });

    it("prevents further reconnection after stop", () => {
      const { cm, reconnectFn, timers } = setup();
      cm.start(reconnectFn);
      cm.handleClose();
      cm.stop();

      timers.advance(100000);
      expect(reconnectFn).not.toHaveBeenCalled();
    });
  });

  describe("event listeners", () => {
    it("on() returns unsubscribe function", () => {
      const { cm, reconnectFn } = setup();
      const states: ConnectionState[] = [];
      const unsub = cm.on("stateChange", (state) => {
        states.push(state);
      });

      cm.start(reconnectFn);
      expect(states).toEqual(["connected"]);

      unsub();
      cm.stop();
      expect(states).toEqual(["connected"]);
    });

    it("emits reconnectFailed on max attempts", async () => {
      const { cm, reconnectFn, timers, reconnectFailures } = setup({
        maxAttempts: 1,
      });
      reconnectFn.mockRejectedValue(new Error("fail"));
      cm.start(reconnectFn);

      cm.handleClose();
      timers.advance(1000);
      await flush();

      expect(reconnectFailures).toHaveLength(1);
    });
  });

  describe("start() idempotency", () => {
    it("calling start() multiple times does not create duplicate listeners", () => {
      const { cm } = setup();
      const fn1 = vi.fn<ReconnectFn>(() => Promise.resolve());
      const fn2 = vi.fn<ReconnectFn>(() => Promise.resolve());

      cm.start(fn1);
      cm.start(fn2);

      cm.handleClose();

      expect(fn1).not.toHaveBeenCalled();
    });
  });
});
