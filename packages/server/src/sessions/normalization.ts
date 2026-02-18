import type {
  ClaudeSessionEntry,
  CodexCompactedEntry,
  CodexCustomToolCallOutputPayload,
  CodexCustomToolCallPayload,
  CodexEventMsgEntry,
  CodexFunctionCallPayload,
  CodexMessagePayload,
  CodexReasoningPayload,
  CodexResponseItemEntry,
  CodexSessionEntry,
  CodexWebSearchCallPayload,
  GeminiAssistantMessage,
  GeminiSessionMessage,
  GeminiUserMessage,
  OpenCodeSessionEntry,
  OpenCodeStoredPart,
  UnifiedSession,
} from "@yep-anywhere/shared";
import { getMessageContent, isConversationEntry } from "@yep-anywhere/shared";
import type { ContentBlock, Message, Session } from "../supervisor/types.js";
import {
  buildDag,
  collectAllToolResultIds,
  findOrphanedToolUses,
  findSiblingToolBranches,
  findSiblingToolResults,
} from "./dag.js";
import type { LoadedSession } from "./types.js";

const CODEX_TOOL_NAME_ALIASES: Record<string, string> = {
  shell_command: "Bash",
  exec_command: "Bash",
  apply_patch: "Edit",
  web_search_call: "WebSearch",
  search_query: "WebSearch",
};

/**
 * Normalize a UnifiedSession into the generic Session format expected by the frontend.
 */
export function normalizeSession(loaded: LoadedSession): Session {
  const { summary, data } = loaded;

  switch (data.provider) {
    case "claude": {
      // Claude sessions are stored as raw messages in the session file.
      // We need to build the DAG to find the active branch.
      const rawMessages = data.session.messages;

      // Build DAG and get active branch (filters out dead branches)
      const { activeBranch } = buildDag(rawMessages);

      // Collect all tool_result IDs from the entire session (not just active branch)
      // This handles parallel tool calls where results may be on sibling branches
      const allToolResultIds = collectAllToolResultIds(rawMessages);

      // Find tool_uses on active branch that have no matching tool_result anywhere
      const orphanedToolUses = findOrphanedToolUses(
        activeBranch,
        allToolResultIds,
      );

      // Find tool_result messages on sibling branches that match tool_uses on active branch
      // These need to be included so the client can pair them with their tool_uses
      const siblingToolResults = findSiblingToolResults(
        activeBranch,
        rawMessages,
      );

      // Find complete sibling tool branches (tool_use + tool_result pairs on dead branches)
      // This handles the case where Claude spawns parallel tasks as chained messages
      const siblingToolBranches = findSiblingToolBranches(
        activeBranch,
        rawMessages,
      );

      // Build a map of parentUuid -> sibling tool_results for efficient insertion
      const siblingsByParent = new Map<string, Message[]>();
      for (const sibling of siblingToolResults) {
        const converted = convertClaudeMessage(
          sibling.raw,
          -1,
          new Set<string>(),
        );
        const existing = siblingsByParent.get(sibling.parentUuid);
        if (existing) {
          existing.push(converted);
        } else {
          siblingsByParent.set(sibling.parentUuid, [converted]);
        }
      }

      // Build a map of branchPoint -> sibling branch nodes for chained parallel tasks
      const siblingBranchesByParent = new Map<string, Message[]>();
      for (const branch of siblingToolBranches) {
        const converted = branch.nodes.map((node) =>
          convertClaudeMessage(node.raw, -1, new Set<string>()),
        );
        const existing = siblingBranchesByParent.get(branch.branchPoint);
        if (existing) {
          existing.push(...converted);
        } else {
          siblingBranchesByParent.set(branch.branchPoint, converted);
        }
      }

      // Convert active branch to Message objects, inserting sibling branches after their parent
      const messages: Message[] = [];
      for (let i = 0; i < activeBranch.length; i++) {
        const node = activeBranch[i];
        if (!node) continue;
        const msg = convertClaudeMessage(node.raw, i, orphanedToolUses);
        messages.push(msg);

        // Insert any sibling tool_results that have this node as their parent
        const siblings = siblingsByParent.get(node.uuid);
        if (siblings) {
          messages.push(...siblings);
        }

        // Insert any sibling tool branches that branch from this node
        const siblingBranchNodes = siblingBranchesByParent.get(node.uuid);
        if (siblingBranchNodes) {
          messages.push(...siblingBranchNodes);
        }
      }

      return {
        ...summary,
        messages,
      };
    }
    case "codex":
    case "codex-oss":
      return {
        ...summary,
        messages: convertCodexEntries(data.session.entries),
      };
    case "gemini":
      return {
        ...summary,
        messages: convertGeminiMessages(data.session.messages),
      };
    case "opencode":
      return {
        ...summary,
        messages: convertOpenCodeEntries(data.session.messages),
      };
  }
}

// --- Claude Conversion Logic ---

function convertClaudeMessage(
  raw: ClaudeSessionEntry,
  _index: number,
  orphanedToolUses: Set<string>,
): Message {
  // Normalize content blocks - pass through all fields
  let content: string | ContentBlock[] | undefined;
  const rawContent = getMessageContent(raw);
  if (typeof rawContent === "string") {
    content = rawContent;
  } else if (Array.isArray(rawContent)) {
    // Pass through all fields from each content block
    // Filter out string items (which can appear in user message content)
    content = rawContent
      .filter((block) => typeof block !== "string")
      .map((block) => ({ ...(block as object) })) as ContentBlock[];
  }

  // Build message by spreading all raw fields, then override with normalized values
  // Use type assertion since we're converting to a looser Message type
  const rawAny = raw as Record<string, unknown>;
  const message: Message = {
    ...rawAny,
    // Include normalized content if message had content
    ...(isConversationEntry(raw) && {
      message: {
        ...(raw.message as Record<string, unknown>),
        ...(content !== undefined && { content }),
      },
    }),
    // Ensure type is set
    type: raw.type,
  };

  // Identify orphaned tool_use IDs in this message's content
  if (Array.isArray(content)) {
    const orphanedIds = content
      .filter(
        (b): b is ContentBlock & { id: string } =>
          b.type === "tool_use" &&
          typeof b.id === "string" &&
          orphanedToolUses.has(b.id),
      )
      .map((b) => b.id);

    if (orphanedIds.length > 0) {
      message.orphanedToolUseIds = orphanedIds;
    }
  }

  return message;
}

// --- Codex Conversion Logic ---

function convertCodexEntries(entries: CodexSessionEntry[]): Message[] {
  const messages: Message[] = [];
  let messageIndex = 0;
  const hasResponseItemUser = hasCodexResponseItemUserMessages(entries);

  for (const entry of entries) {
    if (entry.type === "response_item") {
      const msg = convertCodexResponseItem(entry, messageIndex++);
      if (msg) {
        messages.push(msg);
      }
    } else if (entry.type === "compacted") {
      const msg = convertCodexCompactedEntry(entry, messageIndex++);
      if (msg) {
        messages.push(msg);
      }
    } else if (entry.type === "event_msg") {
      const shouldIncludeUserMessage =
        entry.payload.type === "user_message" && !hasResponseItemUser;
      const shouldIncludeTurnAborted = entry.payload.type === "turn_aborted";
      const shouldIncludeContextCompacted =
        entry.payload.type === "context_compacted";
      // Skip agent_message and agent_reasoning events when response_item exists;
      // those are streaming artifacts that duplicate full response data.
      if (
        shouldIncludeUserMessage ||
        shouldIncludeTurnAborted ||
        shouldIncludeContextCompacted
      ) {
        const msg = convertCodexEventMsg(entry, messageIndex++);
        if (msg) {
          messages.push(msg);
        }
      }
    }
  }

  return messages;
}

function hasCodexResponseItemUserMessages(
  entries: CodexSessionEntry[],
): boolean {
  return entries.some(
    (entry) =>
      entry.type === "response_item" &&
      entry.payload.type === "message" &&
      entry.payload.role === "user",
  );
}

function convertCodexResponseItem(
  entry: CodexResponseItemEntry,
  index: number,
): Message | null {
  const payload = entry.payload;
  const uuid = `codex-${index}-${entry.timestamp}`;

  switch (payload.type) {
    case "message":
      if (payload.role === "developer") {
        return null;
      }
      return convertCodexMessagePayload(payload, uuid, entry.timestamp);

    case "reasoning":
      return convertCodexReasoningPayload(payload, uuid, entry.timestamp);

    case "function_call":
      return convertCodexFunctionCallPayload(payload, uuid, entry.timestamp);

    case "function_call_output":
      return convertCodexToolCallOutputPayload(
        payload.call_id,
        payload.output,
        uuid,
        entry.timestamp,
      );

    case "custom_tool_call":
      return convertCodexCustomToolCallPayload(payload, uuid, entry.timestamp);

    case "custom_tool_call_output":
      return convertCodexToolCallOutputPayload(
        payload.call_id ?? `${uuid}-custom-tool-result`,
        payload.output,
        uuid,
        entry.timestamp,
      );

    case "web_search_call":
      return convertCodexWebSearchCallPayload(payload, uuid, entry.timestamp);

    case "ghost_snapshot":
      return null;

    default:
      return null;
  }
}

function convertCodexMessagePayload(
  payload: CodexMessagePayload,
  uuid: string,
  timestamp: string,
): Message {
  const content: ContentBlock[] = [];

  const fullText = payload.content
    .map((block) =>
      "text" in block && typeof block.text === "string" ? block.text : "",
    )
    .join("");
  if (fullText.trim()) {
    content.push({
      type: "text",
      text: fullText,
    });
  }

  for (const block of payload.content) {
    if (block.type !== "input_image") continue;
    content.push(normalizeCodexInputImageBlock(block));
  }

  if (content.length === 0) {
    return {
      uuid,
      type: payload.role,
      message: {
        role: payload.role,
        content: [],
      },
      timestamp,
    };
  }

  return {
    uuid,
    type: payload.role,
    message: {
      role: payload.role,
      content,
    },
    timestamp,
  };
}

function convertCodexReasoningPayload(
  payload: CodexReasoningPayload,
  uuid: string,
  timestamp: string,
): Message {
  const summaryText = payload.summary
    ?.map((s) => s.text)
    .join("\n")
    .trim();

  const content: ContentBlock[] = [];

  if (summaryText) {
    content.push({
      type: "thinking",
      thinking: summaryText,
    });
  }

  if (payload.encrypted_content && !summaryText) {
    content.push({
      type: "text",
      text: "Reasoning details are encrypted by Codex and unavailable in session logs.",
    });
  }

  return {
    uuid,
    type: "assistant",
    message: {
      role: "assistant",
      content,
    },
    timestamp,
  };
}

type CodexInputImageBlock = Extract<
  CodexMessagePayload["content"][number],
  { type: "input_image" }
>;

function normalizeCodexInputImageBlock(
  block: CodexInputImageBlock,
): ContentBlock {
  const normalized: ContentBlock = { type: "input_image" };

  const filePath =
    typeof block.file_path === "string" ? block.file_path.trim() : "";
  if (filePath) {
    normalized.file_path = filePath;
  }

  const mimeType = resolveCodexInputImageMimeType(block);
  if (mimeType) {
    normalized.mime_type = mimeType;
  }

  const imageUrl =
    typeof block.image_url === "string" ? block.image_url.trim() : "";
  if (imageUrl && !isDataUrl(imageUrl)) {
    normalized.image_url = imageUrl;
  }

  return normalized;
}

function resolveCodexInputImageMimeType(
  block: CodexInputImageBlock,
): string | undefined {
  const explicitMime =
    typeof block.mime_type === "string" ? block.mime_type.trim() : "";
  if (explicitMime) {
    return explicitMime;
  }

  if (typeof block.image_url !== "string") {
    return undefined;
  }

  const dataUrlMime = parseDataUrlMimeType(block.image_url);
  return dataUrlMime || undefined;
}

function isDataUrl(value: string): boolean {
  return value.startsWith("data:");
}

function parseDataUrlMimeType(dataUrl: string): string | null {
  const match = /^data:([^;,]+)[;,]/i.exec(dataUrl);
  return match?.[1] ?? null;
}

function convertCodexFunctionCallPayload(
  payload: CodexFunctionCallPayload,
  uuid: string,
  timestamp: string,
): Message {
  const toolName = canonicalizeCodexToolName(payload.name);
  const parsedInput = parseCodexToolArguments(payload.arguments);
  const input = normalizeCodexToolInput(toolName, parsedInput);

  const content: ContentBlock[] = [
    {
      type: "tool_use",
      id: payload.call_id,
      name: toolName,
      input,
    },
  ];

  return {
    uuid,
    type: "assistant",
    message: {
      role: "assistant",
      content,
    },
    codexToolName: payload.name,
    timestamp,
  };
}

function convertCodexCustomToolCallPayload(
  payload: CodexCustomToolCallPayload,
  uuid: string,
  timestamp: string,
): Message {
  const callId = payload.call_id ?? payload.id ?? `${uuid}-custom-tool`;
  const rawToolName = payload.name ?? "custom_tool_call";
  const toolName = canonicalizeCodexToolName(rawToolName);
  const rawInput =
    payload.input !== undefined
      ? payload.input
      : parseCodexToolArguments(payload.arguments);
  const input = normalizeCodexToolInput(toolName, rawInput);

  const content: ContentBlock[] = [
    {
      type: "tool_use",
      id: callId,
      name: toolName,
      input,
    },
  ];

  return {
    uuid,
    type: "assistant",
    message: {
      role: "assistant",
      content,
    },
    codexToolName: rawToolName,
    timestamp,
  };
}

function convertCodexWebSearchCallPayload(
  payload: CodexWebSearchCallPayload,
  uuid: string,
  timestamp: string,
): Message {
  const callId = payload.call_id ?? payload.id ?? `${uuid}-web-search`;
  const rawToolName = payload.name ?? payload.type;
  const toolName = canonicalizeCodexToolName(rawToolName);

  const parsedArguments = parseCodexToolArguments(payload.arguments);
  let input: Record<string, unknown>;

  if (isRecord(payload.input)) {
    input = { ...payload.input };
  } else if (isRecord(parsedArguments)) {
    input = { ...parsedArguments };
  } else {
    input = {};
  }

  if (typeof payload.query === "string" && typeof input.query !== "string") {
    input.query = payload.query;
  }

  if (payload.action !== undefined && input.action === undefined) {
    input.action = payload.action;
  }

  const content: ContentBlock[] = [
    {
      type: "tool_use",
      id: callId,
      name: toolName,
      input,
    },
  ];

  return {
    uuid,
    type: "assistant",
    message: {
      role: "assistant",
      content,
    },
    codexToolName: rawToolName,
    timestamp,
  };
}

function convertCodexToolCallOutputPayload(
  callId: string,
  output: unknown,
  uuid: string,
  timestamp: string,
): Message {
  const normalized = normalizeCodexToolOutput(output);
  const toolResult: ContentBlock = {
    type: "tool_result",
    tool_use_id: callId,
    content: normalized.content,
    ...(normalized.isError && { is_error: true }),
  };

  return {
    uuid,
    type: "user",
    message: {
      role: "user",
      content: [toolResult],
    },
    ...(normalized.structured !== undefined && {
      toolUseResult: normalized.structured,
    }),
    timestamp,
  };
}

function parseCodexToolArguments(argumentsText?: string): unknown {
  if (!argumentsText) {
    return {};
  }
  try {
    return JSON.parse(argumentsText);
  } catch {
    return { raw: argumentsText };
  }
}

function canonicalizeCodexToolName(name: string): string {
  return (
    CODEX_TOOL_NAME_ALIASES[name] ??
    CODEX_TOOL_NAME_ALIASES[name.toLowerCase()] ??
    name
  );
}

function normalizeCodexToolInput(toolName: string, input: unknown): unknown {
  if (toolName !== "Bash") {
    return input;
  }

  if (typeof input === "string" && input.trim()) {
    return { command: input };
  }

  if (!isRecord(input)) {
    return input;
  }

  const normalized = { ...input };
  if (
    typeof normalized.command !== "string" &&
    typeof normalized.cmd === "string"
  ) {
    normalized.command = normalized.cmd;
  }

  return normalized;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseNumericExitCode(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string" && /^-?\d+$/.test(value.trim())) {
    return Number.parseInt(value, 10);
  }
  return undefined;
}

function extractExitCodeFromRecord(
  record: Record<string, unknown>,
): number | undefined {
  const direct = parseNumericExitCode(record.exit_code ?? record.exitCode);
  if (direct !== undefined) {
    return direct;
  }

  const metadata = record.metadata;
  if (isRecord(metadata)) {
    const nested = parseNumericExitCode(
      metadata.exit_code ?? metadata.exitCode,
    );
    if (nested !== undefined) {
      return nested;
    }
  }

  return undefined;
}

function hasFailedStatus(record: Record<string, unknown>): boolean {
  const status = record.status;
  if (typeof status !== "string") {
    return false;
  }
  const normalized = status.toLowerCase();
  return normalized === "failed" || normalized === "error";
}

function extractExitCodeFromText(output: string): number | undefined {
  const match = output.match(
    /(?:^|\n)\s*(?:Exit code:|Process exited with code)\s*(-?\d+)\b/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

function normalizeCodexToolOutput(output: unknown): {
  content: string;
  structured?: unknown;
  isError: boolean;
} {
  if (typeof output === "string") {
    let structured: unknown;
    let isError = false;

    try {
      structured = JSON.parse(output);
      if (isRecord(structured)) {
        const exitCode = extractExitCodeFromRecord(structured);
        isError =
          structured.is_error === true ||
          (exitCode !== undefined && exitCode !== 0) ||
          hasFailedStatus(structured);
      }
    } catch {
      structured = undefined;
      const exitCode = extractExitCodeFromText(output);
      if (exitCode !== undefined) {
        isError = exitCode !== 0;
      } else {
        // For plain text without exit metadata, only treat explicit error lines as failures.
        isError = /(?:^|\n)\s*(error|fatal|failed):/i.test(output);
      }
    }

    return { content: output, structured, isError };
  }

  if (output === null || output === undefined) {
    return { content: "", isError: false };
  }

  if (typeof output === "number" || typeof output === "boolean") {
    return {
      content: String(output),
      structured: output,
      isError: false,
    };
  }

  if (Array.isArray(output) || isRecord(output)) {
    const isError =
      isRecord(output) &&
      (output.is_error === true ||
        (extractExitCodeFromRecord(output) ?? 0) !== 0 ||
        hasFailedStatus(output));
    return {
      content: JSON.stringify(output, null, 2),
      structured: output,
      isError,
    };
  }

  return { content: String(output), isError: false };
}

function convertCodexCompactedEntry(
  entry: CodexCompactedEntry,
  index: number,
): Message {
  const uuid = `codex-compacted-${index}-${entry.timestamp}`;
  return {
    uuid,
    type: "system",
    subtype: "compact_boundary",
    content: entry.payload.message || "Context compacted",
    timestamp: entry.timestamp,
  };
}

function convertCodexEventMsg(
  entry: CodexEventMsgEntry,
  index: number,
): Message | null {
  const payload = entry.payload;
  const uuid = `codex-event-${index}-${entry.timestamp}`;

  switch (payload.type) {
    case "user_message":
      return {
        uuid,
        type: "user",
        message: {
          role: "user",
          content: payload.message,
        },
        timestamp: entry.timestamp,
      };

    case "agent_message":
      return {
        uuid,
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "text", text: payload.message }],
        },
        timestamp: entry.timestamp,
      };

    case "agent_reasoning":
      return {
        uuid,
        type: "assistant",
        message: {
          role: "assistant",
          content: [{ type: "thinking", thinking: payload.text }],
        },
        timestamp: entry.timestamp,
      };

    case "turn_aborted":
      return {
        uuid,
        type: "system",
        subtype: "turn_aborted",
        content: payload.reason ?? payload.message ?? "Turn aborted",
        timestamp: entry.timestamp,
      };

    case "context_compacted":
      return {
        uuid,
        type: "system",
        subtype: "compact_boundary",
        content: "Context compacted",
        timestamp: entry.timestamp,
      };

    case "item_completed":
      return null;

    default:
      return null;
  }
}

// --- Gemini Conversion Logic ---

function convertGeminiMessages(
  sessionMessages: GeminiSessionMessage[],
): Message[] {
  const messages: Message[] = [];
  for (const msg of sessionMessages) {
    if (msg.type === "user") {
      const userMsg = msg as GeminiUserMessage;
      messages.push({
        uuid: userMsg.id,
        type: "user",
        message: {
          role: "user",
          content: userMsg.content,
        },
        timestamp: userMsg.timestamp,
      });
    } else if (msg.type === "gemini") {
      const assistantMsg = msg as GeminiAssistantMessage;
      const content: ContentBlock[] = [];

      if (assistantMsg.thoughts) {
        for (const thought of assistantMsg.thoughts) {
          content.push({
            type: "thinking",
            thinking: `${thought.subject}: ${thought.description}`,
          });
        }
      }

      if (assistantMsg.content) {
        content.push({
          type: "text",
          text: assistantMsg.content,
        });
      }

      if (assistantMsg.toolCalls) {
        for (const toolCall of assistantMsg.toolCalls) {
          content.push({
            type: "tool_use",
            id: toolCall.id,
            name: toolCall.name,
            input: toolCall.args,
          });
        }
      }

      messages.push({
        uuid: assistantMsg.id,
        type: "assistant",
        message: {
          role: "assistant",
          content,
        },
        timestamp: assistantMsg.timestamp,
      });

      if (assistantMsg.toolCalls) {
        for (const toolCall of assistantMsg.toolCalls) {
          if (toolCall.result && toolCall.result.length > 0) {
            for (const result of toolCall.result) {
              messages.push({
                uuid: `${assistantMsg.id}-result-${result.functionResponse.id}`,
                type: "tool_result",
                toolUseResult: {
                  tool_use_id: result.functionResponse.id,
                  content: result.functionResponse.response.output,
                },
                timestamp: toolCall.timestamp ?? assistantMsg.timestamp,
              });
            }
          }
        }
      }
    }
  }
  return messages;
}

// --- OpenCode Conversion Logic ---

function convertOpenCodeEntries(entries: OpenCodeSessionEntry[]): Message[] {
  const messages: Message[] = [];

  for (const entry of entries) {
    const { message, parts } = entry;
    const uuid = message.id;
    const timestamp = message.time?.created
      ? new Date(message.time.created).toISOString()
      : undefined;

    const content = convertOpenCodeParts(parts);

    messages.push({
      uuid,
      type: message.role,
      message: {
        role: message.role,
        content,
        model: message.modelID,
        usage: message.tokens
          ? {
              input_tokens: message.tokens.input,
              output_tokens: message.tokens.output,
              cache_read_input_tokens: message.tokens.cache?.read,
            }
          : undefined,
      },
      timestamp,
      // Include OpenCode-specific fields
      ...(message.parentID && { parentId: message.parentID }),
      ...(message.mode && { mode: message.mode }),
      ...(message.agent && { agent: message.agent }),
      ...(message.finish && { finish: message.finish }),
    });
  }

  return messages;
}

function convertOpenCodeParts(parts: OpenCodeStoredPart[]): ContentBlock[] {
  const blocks: ContentBlock[] = [];

  for (const part of parts) {
    switch (part.type) {
      case "text":
        if (part.text) {
          blocks.push({
            type: "text",
            text: part.text,
          });
        }
        break;

      case "tool":
        if (part.tool && part.callID) {
          // Tool use block
          blocks.push({
            type: "tool_use",
            id: part.callID,
            name: part.tool,
            input: part.state?.input ?? {},
          });

          // If tool has completed, add tool result block
          if (part.state?.status === "completed") {
            const resultContent = part.state.error
              ? part.state.error
              : typeof part.state.output === "string"
                ? part.state.output
                : JSON.stringify(part.state.output ?? "");

            blocks.push({
              type: "tool_result",
              tool_use_id: part.callID,
              content: resultContent,
              is_error: !!part.state.error,
            });
          }
        }
        break;

      // Skip step-start and step-finish (metadata, not content)
      case "step-start":
      case "step-finish":
        break;

      default:
        // Unknown part type - skip
        break;
    }
  }

  return blocks;
}
