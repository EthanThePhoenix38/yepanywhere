
import type { GeminiSessionFile } from "../gemini-schema/session.js";
import type { CodexSessionEntry } from "../codex-schema/index.js";

// Placeholder for Claude session type - effectively loosely typed JSONL lines for now
// as we don't have a strict schema for Claude session files in shared yet.
// They are just JSONL files where each line is a message.
export interface ClaudeSessionFile {
  // TODO: Replace with RawSessionMessage[] from reader.ts or define a shared type.
  // The JSONL format includes type, message, uuid, parentUuid, toolUseResult, etc.
  // See RawSessionMessage in packages/server/src/sessions/reader.ts for the shape.
  messages: unknown[];
}

// Codex sessions are a series of entries (lines)
export interface CodexSessionContent {
  entries: CodexSessionEntry[];
}

export type UnifiedSession =
  | { provider: "claude"; session: ClaudeSessionFile }
  | { provider: "codex"; session: CodexSessionContent }
  | { provider: "gemini"; session: GeminiSessionFile };
