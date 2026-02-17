import type { CodexSessionEntry } from "@yep-anywhere/shared";
import { describe, expect, it } from "vitest";
import { normalizeSession } from "../../src/sessions/normalization.js";
import type { LoadedSession } from "../../src/sessions/types.js";

function buildLoadedSession(entries: CodexSessionEntry[]): LoadedSession {
  return {
    summary: {
      id: "test-session",
      projectId: "test-project",
      title: "Test Session",
      fullTitle: "Test Session",
      createdAt: "2024-01-01T00:00:00Z",
      updatedAt: "2024-01-01T00:00:02Z",
      messageCount: entries.length,
      status: "chat",
      provider: "codex-oss",
      // biome-ignore lint/suspicious/noExplicitAny: mock summary shape
    } as any,
    data: {
      provider: "codex-oss",
      events: [],
      session: {
        entries,
      },
      // biome-ignore lint/suspicious/noExplicitAny: mock session shape
    } as any,
  };
}

describe("Codex Normalization", () => {
  it("normalizes a codex session as a flat list without parentUuid", () => {
    // 1. User message (event_msg) - will be deduped because of item #3
    // 2. Assistant message (response_item)
    // 3. User message (response_item)
    const entries: CodexSessionEntry[] = [
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:01Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Hi there" }],
        },
      },
      {
        type: "event_msg",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "user_message",
          message: "How are you?",
        },
      },
      // Duplicate user message event (should be deduped/shadowed by response_item)
      // Actually, we want to test that if a response_item exists, event_msgs are ignored.
      // So we add a response_item for the user message.
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: "How are you?" }],
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));

    // Expecting 2 messages because the first event_msg is deduped
    expect(result.messages).toHaveLength(2);

    // Check that parentUuid is undefined for all messages
    // Check that parentUuid is undefined for all messages
    for (const msg of result.messages) {
      expect(msg.parentUuid).toBeUndefined();
    }

    // Check content
    // Message 0: Assistant "Hi there"
    const msg0 = result.messages[0];
    const content0 = msg0.message?.content;
    expect(Array.isArray(content0) ? content0[0] : content0).toEqual({
      type: "text",
      text: "Hi there",
    });

    // Message 1: User "How are you?"
    const msg1 = result.messages[1];
    const content1 = msg1.message?.content;
    expect(Array.isArray(content1) ? content1[0] : content1).toEqual({
      type: "text",
      text: "How are you?",
    });
  });

  it("normalizes function_call_output into user tool_result blocks", () => {
    const entries: CodexSessionEntry[] = [
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:01Z",
        payload: {
          type: "function_call",
          name: "shell_command",
          call_id: "call-1",
          arguments: '{"command":"npm test"}',
        },
      },
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "function_call_output",
          call_id: "call-1",
          output: "Exit code: 0",
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));
    expect(result.messages).toHaveLength(2);

    const toolUseMessage = result.messages[0];
    const toolResultMessage = result.messages[1];
    const toolUseContent = toolUseMessage?.message?.content;
    const toolResultContent = toolResultMessage?.message?.content;

    expect(
      Array.isArray(toolUseContent) ? toolUseContent[0] : toolUseContent,
    ).toMatchObject({
      type: "tool_use",
      id: "call-1",
      name: "Bash",
    });
    expect(toolResultMessage?.type).toBe("user");
    expect(
      Array.isArray(toolResultContent)
        ? toolResultContent[0]
        : toolResultContent,
    ).toMatchObject({
      type: "tool_result",
      tool_use_id: "call-1",
      content: "Exit code: 0",
    });
  });

  it("normalizes custom_tool_call and maps apply_patch to Edit", () => {
    const entries: CodexSessionEntry[] = [
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:01Z",
        payload: {
          type: "custom_tool_call",
          call_id: "call-2",
          name: "apply_patch",
          input: { patch: "*** Begin Patch" },
        },
      },
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "custom_tool_call_output",
          call_id: "call-2",
          output: '{"ok":true}',
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));
    expect(result.messages).toHaveLength(2);

    const toolUseMessage = result.messages[0];
    const toolResultMessage = result.messages[1];
    const toolUseContent = toolUseMessage?.message?.content;

    expect(
      Array.isArray(toolUseContent) ? toolUseContent[0] : toolUseContent,
    ).toMatchObject({
      type: "tool_use",
      id: "call-2",
      name: "Edit",
    });
    expect(toolResultMessage?.toolUseResult).toMatchObject({ ok: true });
  });

  it("skips developer messages from the normalized transcript", () => {
    const entries: CodexSessionEntry[] = [
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:01Z",
        payload: {
          type: "message",
          role: "developer",
          content: [{ type: "input_text", text: "internal prompt" }],
        },
      },
      {
        type: "response_item",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "message",
          role: "assistant",
          content: [{ type: "output_text", text: "Visible output" }],
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]?.message?.role).toBe("assistant");
  });

  it("emits turn_aborted as a visible system entry", () => {
    const entries: CodexSessionEntry[] = [
      {
        type: "event_msg",
        timestamp: "2024-01-01T00:00:02Z",
        payload: {
          type: "turn_aborted",
          reason: "approval denied",
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      type: "system",
      subtype: "turn_aborted",
      content: "approval denied",
    });
  });

  it("emits compacted entries as compact boundary system messages", () => {
    const entries: CodexSessionEntry[] = [
      {
        type: "compacted",
        timestamp: "2024-01-01T00:00:03Z",
        payload: {
          message: "Compacted 12 messages",
        },
      },
    ];

    const result = normalizeSession(buildLoadedSession(entries));
    expect(result.messages).toHaveLength(1);
    expect(result.messages[0]).toMatchObject({
      type: "system",
      subtype: "compact_boundary",
      content: "Compacted 12 messages",
    });
  });
});
