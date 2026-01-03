/**
 * Event schemas for Gemini CLI stream-json output.
 *
 * Gemini emits JSON objects with different types:
 * - user: User messages
 * - gemini: Gemini responses
 * - info: Status/metadata info
 * - error: Error messages
 * - done: Completion signal
 */

import { z } from "zod";
import { GeminiContentSchema, GeminiPartSchema } from "./content.js";

/**
 * Thought item (Gemini's chain-of-thought/reasoning).
 */
export const GeminiThoughtSchema = z.object({
  subject: z.string().optional(),
  description: z.string().optional(),
  thought: z.string().optional(),
});

export type GeminiThought = z.infer<typeof GeminiThoughtSchema>;

/**
 * Token usage breakdown.
 */
export const GeminiTokensSchema = z.object({
  promptTokenCount: z.number().optional(),
  candidatesTokenCount: z.number().optional(),
  totalTokenCount: z.number().optional(),
  cachedContentTokenCount: z.number().optional(),
  thoughtsTokenCount: z.number().optional(),
});

export type GeminiTokens = z.infer<typeof GeminiTokensSchema>;

/**
 * User message event.
 */
export const GeminiUserEventSchema = z.object({
  type: z.literal("user"),
  content: z.string().optional(),
  parts: z.array(GeminiPartSchema).optional(),
  timestamp: z.string().optional(),
});

export type GeminiUserEvent = z.infer<typeof GeminiUserEventSchema>;

/**
 * Gemini response event.
 */
export const GeminiResponseEventSchema = z.object({
  type: z.literal("gemini"),
  content: GeminiContentSchema.optional(),
  text: z.string().optional(),
  parts: z.array(GeminiPartSchema).optional(),
  thoughts: z.array(GeminiThoughtSchema).optional(),
  tokens: GeminiTokensSchema.optional(),
  finishReason: z
    .enum(["STOP", "MAX_TOKENS", "SAFETY", "RECITATION", "OTHER"])
    .optional(),
  timestamp: z.string().optional(),
});

export type GeminiResponseEvent = z.infer<typeof GeminiResponseEventSchema>;

/**
 * Info/status event.
 */
export const GeminiInfoEventSchema = z.object({
  type: z.literal("info"),
  message: z.string().optional(),
  status: z.string().optional(),
  model: z.string().optional(),
  session_id: z.string().optional(),
  cwd: z.string().optional(),
  timestamp: z.string().optional(),
});

export type GeminiInfoEvent = z.infer<typeof GeminiInfoEventSchema>;

/**
 * Error event.
 */
export const GeminiErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string().optional(),
  message: z.string().optional(),
  code: z.string().optional(),
});

export type GeminiErrorEvent = z.infer<typeof GeminiErrorEventSchema>;

/**
 * Done/completion event.
 */
export const GeminiDoneEventSchema = z.object({
  type: z.literal("done"),
  tokens: GeminiTokensSchema.optional(),
  duration_ms: z.number().optional(),
});

export type GeminiDoneEvent = z.infer<typeof GeminiDoneEventSchema>;

/**
 * Tool execution event.
 */
export const GeminiToolEventSchema = z.object({
  type: z.literal("tool"),
  name: z.string(),
  args: z.record(z.string(), z.unknown()).optional(),
  result: z.unknown().optional(),
  status: z.enum(["pending", "running", "completed", "error"]).optional(),
  timestamp: z.string().optional(),
});

export type GeminiToolEvent = z.infer<typeof GeminiToolEventSchema>;

/**
 * Union of all Gemini event types.
 */
export const GeminiEventSchema = z.discriminatedUnion("type", [
  GeminiUserEventSchema,
  GeminiResponseEventSchema,
  GeminiInfoEventSchema,
  GeminiErrorEventSchema,
  GeminiDoneEventSchema,
  GeminiToolEventSchema,
]);

export type GeminiEvent = z.infer<typeof GeminiEventSchema>;

/**
 * Parse a JSON line into a GeminiEvent.
 * Returns null if parsing fails.
 */
export function parseGeminiEvent(line: string): GeminiEvent | null {
  try {
    const json = JSON.parse(line);
    const result = GeminiEventSchema.safeParse(json);
    if (result.success) {
      return result.data;
    }
    // Return as unknown event for forward compatibility
    if (json && typeof json === "object" && "type" in json) {
      return json as GeminiEvent;
    }
    return null;
  } catch {
    return null;
  }
}
