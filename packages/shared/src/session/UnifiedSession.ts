
import type { GeminiSessionFile } from "../gemini-schema/session.js";
import type { CodexSessionEntry } from "../codex-schema/index.js";

/**
 * Raw content block from Claude JSONL - loosely typed to preserve all fields.
 * This is intentionally looser than the Zod schemas to handle:
 * - Older format entries
 * - Unknown/new content block types
 * - Extra fields we want to preserve for pass-through
 */
export interface ClaudeRawContentBlock {
  type: string;
  id?: string;
  text?: string;
  thinking?: string;
  signature?: string;
  name?: string;
  input?: unknown;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
  [key: string]: unknown;
}

/**
 * Raw JSONL message format from Claude Code sessions.
 *
 * This is intentionally looser than SessionEntry to handle:
 * - Older format entries that don't have all required fields
 * - Result entries, agent entries, etc. not covered by SessionEntry
 * - Extra fields we want to preserve for pass-through
 *
 * Key fields used by the DAG builder and normalization:
 * - `type`: Discriminator (user, assistant, system, summary, result, etc.)
 * - `uuid`/`parentUuid`: DAG structure for conversation branching
 * - `message.content`: The actual message content
 * - `toolUseResult`: Tool execution results
 * - `parent_tool_use_id`: Links agent sessions to their parent Task tool_use
 */
export interface ClaudeRawSessionMessage {
  type: string;
  subtype?: string;
  message?: {
    content: string | ClaudeRawContentBlock[];
    role?: string;
    [key: string]: unknown;
  };
  uuid?: string;
  parentUuid?: string | null;
  /** For compact_boundary messages, points to the last message before compaction */
  logicalParentUuid?: string | null;
  timestamp?: string;
  toolUseResult?: unknown;
  /** Links agent sessions to their parent Task tool_use */
  parent_tool_use_id?: string;
  [key: string]: unknown;
}

/**
 * Claude session file content - array of raw JSONL entries.
 */
export interface ClaudeSessionFile {
  messages: ClaudeRawSessionMessage[];
}

// Codex sessions are a series of entries (lines)
export interface CodexSessionContent {
  entries: CodexSessionEntry[];
}

export type UnifiedSession =
  | { provider: "claude"; session: ClaudeSessionFile }
  | { provider: "codex"; session: CodexSessionContent }
  | { provider: "gemini"; session: GeminiSessionFile };
