/**
 * Type-only exports for Gemini schema.
 * Import from here to avoid pulling in Zod runtime.
 */

export type {
  GeminiTextPart,
  GeminiFunctionCallPart,
  GeminiFunctionResponsePart,
  GeminiInlineDataPart,
  GeminiPart,
  GeminiContent,
} from "./content.js";

export type {
  GeminiThought,
  GeminiTokens,
  GeminiUserEvent,
  GeminiResponseEvent,
  GeminiInfoEvent,
  GeminiErrorEvent,
  GeminiDoneEvent,
  GeminiToolEvent,
  GeminiEvent,
} from "./events.js";
