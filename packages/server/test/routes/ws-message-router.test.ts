import { BinaryFormat } from "@yep-anywhere/shared";
import { describe, expect, it, vi } from "vitest";
import { encryptToBinaryEnvelopeWithCompression } from "../../src/crypto/index.js";
import {
  decodeFrameToParsedMessage,
  routeClientMessageSafely,
} from "../../src/routes/ws-message-router.js";
import { createConnectionState } from "../../src/routes/ws-relay-handlers.js";

function createMockWs() {
  return {
    close: vi.fn<(code?: number, reason?: string) => void>(),
    send: vi.fn(),
  };
}

function createDecodeDeps() {
  return {
    uploads: new Map(),
    send: vi.fn(),
    uploadManager: {} as never,
    routeClientMessage: vi.fn(async () => undefined),
    handleBinaryUploadChunk: vi.fn(async () => undefined),
  };
}

describe("WebSocket Message Router", () => {
  it("decodes text JSON frames", async () => {
    const connState = createConnectionState();
    const ws = createMockWs();
    const deps = createDecodeDeps();

    const parsed = await decodeFrameToParsedMessage(
      ws,
      JSON.stringify({ type: "ping", id: "p1" }),
      {},
      connState,
      false,
      deps,
    );

    expect(parsed).toEqual({ type: "ping", id: "p1" });
  });

  it("decodes plaintext binary JSON frames (phase 0)", async () => {
    const connState = createConnectionState();
    const ws = createMockWs();
    const deps = createDecodeDeps();
    const jsonBytes = new TextEncoder().encode(
      JSON.stringify({ type: "ping", id: "p2" }),
    );
    const frame = new Uint8Array(1 + jsonBytes.length);
    frame[0] = BinaryFormat.JSON;
    frame.set(jsonBytes, 1);

    const parsed = await decodeFrameToParsedMessage(
      ws,
      frame,
      { isBinary: true },
      connState,
      false,
      deps,
    );

    expect(parsed).toEqual({ type: "ping", id: "p2" });
    expect(connState.useBinaryFrames).toBe(true);
  });

  it("routes encrypted binary envelope payloads after SRP auth", async () => {
    const connState = createConnectionState();
    connState.authState = "authenticated";
    connState.sessionKey = new Uint8Array(32).fill(3);
    const ws = createMockWs();
    const deps = createDecodeDeps();
    const envelope = encryptToBinaryEnvelopeWithCompression(
      JSON.stringify({ type: "ping", id: "p3" }),
      connState.sessionKey,
      false,
    );

    const parsed = await decodeFrameToParsedMessage(
      ws,
      envelope,
      { isBinary: true },
      connState,
      true,
      deps,
    );

    expect(parsed).toBeNull();
    expect(connState.useBinaryEncrypted).toBe(true);
    expect(deps.routeClientMessage).toHaveBeenCalledWith({
      type: "ping",
      id: "p3",
    });
  });

  it("closes unknown plaintext binary formats with code 4002", async () => {
    const connState = createConnectionState();
    const ws = createMockWs();
    const deps = createDecodeDeps();
    const frame = new Uint8Array([0x7f, 0x00]);

    const parsed = await decodeFrameToParsedMessage(
      ws,
      frame,
      { isBinary: true },
      connState,
      false,
      deps,
    );

    expect(parsed).toBeNull();
    expect(ws.close).toHaveBeenCalledWith(
      4002,
      expect.stringContaining("0x7f"),
    );
  });

  it("routes message handlers and returns 500 response on handler failure", async () => {
    const send = vi.fn();
    const handlers = {
      onRequest: vi.fn(async () => {
        throw new Error("boom");
      }),
      onSubscribe: vi.fn(async () => undefined),
      onUnsubscribe: vi.fn(async () => undefined),
      onUploadStart: vi.fn(async () => undefined),
      onUploadChunk: vi.fn(async () => undefined),
      onUploadEnd: vi.fn(async () => undefined),
      onPing: vi.fn(async () => undefined),
    };
    const requestMsg = {
      type: "request",
      id: "req-1",
      method: "GET",
      path: "/health",
    } as const;

    await routeClientMessageSafely(requestMsg, send, handlers);

    expect(handlers.onRequest).toHaveBeenCalledWith(requestMsg);
    expect(send).toHaveBeenCalledWith({
      type: "response",
      id: "req-1",
      status: 500,
      body: { error: "Internal server error" },
    });
  });
});
