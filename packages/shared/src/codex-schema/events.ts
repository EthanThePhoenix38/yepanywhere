/**
 * Event schemas for Codex CLI JSONL output.
 *
 * Codex emits JSONL lines with different event types:
 * - session_meta: Session metadata
 * - event_msg: Event messages (user, agent, tokens, reasoning)
 * - response_item: Response items
 * - turn_context: Turn context info
 */

import { z } from "zod";
import { CodexContentBlockSchema } from "./content.js";

/**
 * Session metadata event.
 * Emitted at the start of a session.
 */
export const CodexSessionMetaSchema = z.object({
  type: z.literal("session_meta"),
  session_id: z.string(),
  model: z.string().optional(),
  cwd: z.string().optional(),
  started_at: z.string().optional(),
});

export type CodexSessionMeta = z.infer<typeof CodexSessionMetaSchema>;

/**
 * User message event.
 */
export const CodexUserMessageSchema = z.object({
  type: z.literal("event_msg"),
  event_type: z.literal("user_message"),
  id: z.string().optional(),
  content: z.union([z.string(), z.array(CodexContentBlockSchema)]),
  timestamp: z.string().optional(),
});

export type CodexUserMessage = z.infer<typeof CodexUserMessageSchema>;

/**
 * Agent message event.
 */
export const CodexAgentMessageSchema = z.object({
  type: z.literal("event_msg"),
  event_type: z.literal("agent_message"),
  id: z.string().optional(),
  content: z.union([z.string(), z.array(CodexContentBlockSchema)]),
  timestamp: z.string().optional(),
  stop_reason: z.enum(["end_turn", "tool_use", "max_tokens"]).optional(),
});

export type CodexAgentMessage = z.infer<typeof CodexAgentMessageSchema>;

/**
 * Agent reasoning event (thinking/chain-of-thought).
 */
export const CodexAgentReasoningSchema = z.object({
  type: z.literal("event_msg"),
  event_type: z.literal("agent_reasoning"),
  id: z.string().optional(),
  summary: z.string().optional(),
  encrypted: z.boolean().optional(),
  timestamp: z.string().optional(),
});

export type CodexAgentReasoning = z.infer<typeof CodexAgentReasoningSchema>;

/**
 * Token count event.
 */
export const CodexTokenCountSchema = z.object({
  type: z.literal("event_msg"),
  event_type: z.literal("token_count"),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  total_tokens: z.number().optional(),
});

export type CodexTokenCount = z.infer<typeof CodexTokenCountSchema>;

/**
 * Response item event.
 * Contains message, reasoning, or ghost_snapshot.
 */
export const CodexResponseItemSchema = z.object({
  type: z.literal("response_item"),
  item_type: z.enum(["message", "reasoning", "ghost_snapshot"]),
  id: z.string().optional(),
  content: z.union([z.string(), z.array(CodexContentBlockSchema)]).optional(),
  role: z.enum(["user", "assistant"]).optional(),
  timestamp: z.string().optional(),
});

export type CodexResponseItem = z.infer<typeof CodexResponseItemSchema>;

/**
 * Turn context event.
 * Contains context about the current turn.
 */
export const CodexTurnContextSchema = z.object({
  type: z.literal("turn_context"),
  turn_id: z.string().optional(),
  parent_turn_id: z.string().optional(),
  cwd: z.string().optional(),
});

export type CodexTurnContext = z.infer<typeof CodexTurnContextSchema>;

/**
 * Error event.
 */
export const CodexErrorSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
  code: z.string().optional(),
  message: z.string().optional(),
});

export type CodexError = z.infer<typeof CodexErrorSchema>;

/**
 * Result/completion event.
 * Emitted when the session completes.
 */
export const CodexResultSchema = z.object({
  type: z.literal("result"),
  status: z.enum(["success", "error", "cancelled"]).optional(),
  message: z.string().optional(),
  total_tokens: z.number().optional(),
  total_cost_usd: z.number().optional(),
});

export type CodexResult = z.infer<typeof CodexResultSchema>;

/**
 * Event message union (all event_msg subtypes).
 */
export const CodexEventMsgSchema = z.discriminatedUnion("event_type", [
  CodexUserMessageSchema,
  CodexAgentMessageSchema,
  CodexAgentReasoningSchema,
  CodexTokenCountSchema,
]);

export type CodexEventMsg = z.infer<typeof CodexEventMsgSchema>;

/**
 * Union of all Codex event types.
 * Use this for parsing JSONL lines.
 */
export const CodexEventSchema = z.union([
  CodexSessionMetaSchema,
  CodexEventMsgSchema,
  CodexResponseItemSchema,
  CodexTurnContextSchema,
  CodexErrorSchema,
  CodexResultSchema,
]);

export type CodexEvent = z.infer<typeof CodexEventSchema>;

/**
 * Parse a JSONL line into a CodexEvent.
 * Returns null if parsing fails.
 */
export function parseCodexEvent(line: string): CodexEvent | null {
  try {
    const json = JSON.parse(line);
    const result = CodexEventSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return as unknown event for forward compatibility
    return json;
  } catch {
    return null;
  }
}
