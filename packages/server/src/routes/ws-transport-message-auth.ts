import type { RemoteClientMessage } from "@yep-anywhere/shared";
import {
  MIN_BINARY_ENVELOPE_LENGTH,
  isEncryptedEnvelope,
} from "@yep-anywhere/shared";
import { decrypt } from "../crypto/index.js";
import type { ConnectionState, WSAdapter } from "./ws-relay-handlers.js";
import { hasEstablishedSrpTransport } from "./ws-transport-auth.js";

/**
 * Check if binary data is a binary encrypted envelope.
 * Binary envelope: [1 byte: version 0x01][24 bytes: nonce][ciphertext]
 * vs Phase 0 binary: [1 byte: format 0x01-0x03][payload]
 *
 * Once a connection has sent one encrypted envelope (useBinaryEncrypted=true),
 * all subsequent binary frames are encrypted — no ambiguity.
 *
 * For the first binary frame, the auth state is the primary discriminator:
 * authenticated connections always use encrypted envelopes, while
 * unauthenticated connections use Phase 0 frames. These are mutually exclusive
 * because clients must complete SRP before sending application messages.
 */
export function isBinaryEncryptedEnvelope(
  bytes: Uint8Array,
  connState: ConnectionState,
): boolean {
  if (!hasEstablishedSrpTransport(connState)) {
    if (bytes.length >= MIN_BINARY_ENVELOPE_LENGTH && bytes[0] === 0x01) {
      console.warn(
        `[WS Relay] Binary envelope rejected: authState=${connState.authState}, hasKey=${!!connState.sessionKey}`,
      );
    }
    return false;
  }

  if (connState.useBinaryEncrypted) {
    return true;
  }

  if (bytes.length < MIN_BINARY_ENVELOPE_LENGTH) {
    return false;
  }

  if (bytes[0] !== 0x01) {
    return false;
  }

  return true;
}

/**
 * Enforce that an SRP-authenticated connection does not send plaintext binary frames.
 * Returns true when the message was rejected and the caller should stop processing.
 */
export function rejectPlaintextBinaryWhenEncryptedRequired(
  ws: WSAdapter,
  connState: ConnectionState,
  srpRequiredPolicy: boolean,
): boolean {
  if (
    srpRequiredPolicy &&
    hasEstablishedSrpTransport(connState) &&
    connState.requiresEncryptedMessages
  ) {
    console.warn(
      "[WS Relay] Received plaintext binary frame after authentication",
    );
    ws.close(4005, "Encrypted message required");
    return true;
  }

  return false;
}

/**
 * Parse an application-level message after SRP control messages are ruled out.
 * Handles legacy JSON encrypted envelopes and plaintext policy checks.
 * Returns null if the message was rejected/closed.
 */
export function parseApplicationClientMessage(
  ws: WSAdapter,
  connState: ConnectionState,
  srpRequiredPolicy: boolean,
  parsed: unknown,
): RemoteClientMessage | null {
  if (isEncryptedEnvelope(parsed)) {
    if (!hasEstablishedSrpTransport(connState)) {
      console.warn(
        "[WS Relay] Received encrypted message but not authenticated",
      );
      ws.close(4001, "Authentication required");
      return null;
    }

    const decrypted = decrypt(
      parsed.nonce,
      parsed.ciphertext,
      connState.sessionKey,
    );
    if (!decrypted) {
      console.warn("[WS Relay] Failed to decrypt message");
      ws.close(4004, "Decryption failed");
      return null;
    }

    try {
      return JSON.parse(decrypted) as RemoteClientMessage;
    } catch {
      console.warn("[WS Relay] Failed to parse decrypted message");
      ws.close(4004, "Decryption failed");
      return null;
    }
  }

  if (srpRequiredPolicy && !hasEstablishedSrpTransport(connState)) {
    console.warn("[WS Relay] Received plaintext message but auth required");
    ws.close(4001, "Authentication required");
    return null;
  }

  if (
    srpRequiredPolicy &&
    hasEstablishedSrpTransport(connState) &&
    connState.requiresEncryptedMessages
  ) {
    console.warn("[WS Relay] Received plaintext message after authentication");
    ws.close(4005, "Encrypted message required");
    return null;
  }

  return parsed as RemoteClientMessage;
}
