import type { CodexSessionEntry } from "@yep-anywhere/shared";
import { describe, expect, it } from "vitest";
import { normalizeSession } from "../../src/sessions/normalization.js";
import type { LoadedSession } from "../../src/sessions/types.js";

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

    const loadedSession: LoadedSession = {
      summary: {
        id: "test-session",
        projectId: "test-project",
        title: "Test Session",
        fullTitle: "Test Session",
        createdAt: "2024-01-01T00:00:00Z",
        updatedAt: "2024-01-01T00:00:02Z",
        messageCount: 3,
        status: "chat",
        provider: "codex-oss",
        // biome-ignore lint/suspicious/noExplicitAny: mock data
      } as any,
      data: {
        provider: "codex-oss",
        events: [],
        session: {
          entries,
        },
        // biome-ignore lint/suspicious/noExplicitAny: mock data
      } as any,
    };

    const result = normalizeSession(loadedSession);

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
});
