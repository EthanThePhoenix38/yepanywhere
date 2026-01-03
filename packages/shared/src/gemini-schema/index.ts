/**
 * Gemini SDK Schema
 *
 * Zod schemas for parsing Gemini CLI stream-json output.
 * Based on the event types from `gemini -o stream-json`.
 *
 * Event types:
 * - user: User messages
 * - gemini: Gemini responses with text, thoughts, and token usage
 * - info: Status/metadata info
 * - error: Error messages
 * - done: Completion signal
 * - tool: Tool execution events
 */

export * from "./events.js";
export * from "./content.js";
export * from "./types.js";
