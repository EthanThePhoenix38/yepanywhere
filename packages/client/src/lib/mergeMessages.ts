import { orderByParentChain } from "@yep-anywhere/shared";
import type { Message } from "../types";

/**
 * Get the message ID, preferring uuid over id.
 * Messages should always have at least one identifier; returns empty string as fallback.
 */
export function getMessageId(m: Message): string {
  return m.uuid ?? m.id ?? "";
}

/**
 * Helper to get content from a message, handling both top-level and SDK nested structure.
 * SDK messages have content nested in message.content.
 */
export function getMessageContent(m: Message): unknown {
  return m.content ?? (m.message as { content?: unknown } | undefined)?.content;
}

/**
 * Merge messages from different sources.
 * JSONL (from disk) is authoritative; SDK (streaming) provides real-time updates.
 *
 * Strategy:
 * - If message only exists from one source, use it
 * - If both exist, use JSONL as base but preserve any SDK-only fields
 * - Warn if SDK has fields that JSONL doesn't (validates our assumption)
 */
export function mergeMessage(
  existing: Message | undefined,
  incoming: Message,
  incomingSource: "sdk" | "jsonl",
): Message {
  if (!existing) {
    return { ...incoming, _source: incomingSource };
  }

  const existingSource = existing._source ?? "sdk";

  // If incoming is JSONL, it's authoritative - use it as base
  if (incomingSource === "jsonl") {
    // SDK messages have extra streaming metadata not persisted to JSONL:
    // - session_id: routing/tracking for the streaming session
    // - parent_tool_use_id: tracks which tool spawned a sub-agent message
    // - eventType: SSE envelope type (message, status, etc.)
    // This is expected - JSONL stores conversation content, SDK includes transient fields.
    // The merge preserves SDK-only fields while using JSONL as authoritative base.
    return {
      ...existing,
      ...incoming,
      _source: "jsonl",
    };
  }

  // If incoming is SDK and existing is JSONL, keep JSONL (it's authoritative)
  if (existingSource === "jsonl") {
    return existing;
  }

  // Both are SDK - use the newer one (incoming)
  return { ...incoming, _source: "sdk" };
}

export interface MergeJSONLResult {
  messages: Message[];
}

/**
 * Merge incoming JSONL messages with existing messages.
 *
 * Handles:
 * - Deduplication by message ID (uuid)
 * - Position preservation
 * - Adding new messages at end
 *
 * Note: Temp message deduplication is no longer needed since pending messages
 * are tracked separately via tempId echoed from SSE.
 */
export function mergeJSONLMessages(
  existing: Message[],
  incoming: Message[],
): MergeJSONLResult {
  // Create a map of existing messages for efficient lookup
  // Use getMessageId for canonical identifier (uuid preferred over id)
  const messageMap = new Map(existing.map((m) => [getMessageId(m), m]));

  // Merge each incoming JSONL message
  for (const incomingMsg of incoming) {
    const incomingId = getMessageId(incomingMsg);
    const existingMsg = messageMap.get(incomingId);
    messageMap.set(incomingId, mergeMessage(existingMsg, incomingMsg, "jsonl"));
  }

  // Build result array, preserving order
  const result: Message[] = [];
  const seen = new Set<string>();

  // First add existing messages (in order)
  for (const msg of existing) {
    const msgId = getMessageId(msg);
    if (!seen.has(msgId)) {
      result.push(messageMap.get(msgId) ?? msg);
      seen.add(msgId);
    }
  }

  // Then add any truly new messages
  for (const incomingMsg of incoming) {
    const incomingId = getMessageId(incomingMsg);
    if (!seen.has(incomingId)) {
      result.push(messageMap.get(incomingId) ?? incomingMsg);
      seen.add(incomingId);
    }
  }

  // Reorder messages by parentUuid chain to fix race conditions
  // where SSE messages arrived before their parent (e.g., agent response before user message)
  return { messages: orderByParentChain(result) };
}

export interface MergeSSEResult {
  messages: Message[];
  /** Index where the message was inserted/updated */
  index: number;
}

/**
 * Merge an incoming SSE message with existing messages.
 *
 * Handles:
 * - Merging with existing message if same ID
 * - Adding new messages at end
 *
 * Note: Temp message replacement is no longer needed since pending messages
 * are tracked separately via tempId echoed from SSE.
 */
export function mergeSSEMessage(
  existing: Message[],
  incoming: Message,
): MergeSSEResult {
  const incomingId = getMessageId(incoming);
  // Check for existing message with same ID
  const existingIdx = existing.findIndex((m) => getMessageId(m) === incomingId);

  if (existingIdx >= 0) {
    // Merge with existing message
    const existingMsg = existing[existingIdx];
    const merged = mergeMessage(existingMsg, incoming, "sdk");

    // Only update if actually different
    if (existingMsg === merged) {
      return {
        messages: existing,
        index: existingIdx,
      };
    }

    const updated = [...existing];
    updated[existingIdx] = merged;
    return {
      messages: updated,
      index: existingIdx,
    };
  }

  // Add new message
  return {
    messages: [...existing, { ...incoming, _source: "sdk" }],
    index: existing.length,
  };
}
