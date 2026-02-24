import { randomUUID } from "node:crypto";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ClaudeSessionEntry, UrlProjectId } from "@yep-anywhere/shared";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { normalizeSession } from "../../src/sessions/normalization.js";
import {
  SessionReader,
  computeCompactionOverhead,
} from "../../src/sessions/reader.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = join(__dirname, "..", "fixtures", "agents");

describe("SessionReader", () => {
  let testDir: string;
  let reader: SessionReader;

  beforeEach(async () => {
    testDir = join(tmpdir(), `claude-reader-test-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    reader = new SessionReader({ sessionDir: testDir });
  });

  afterEach(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  describe("title extraction", () => {
    it("skips ide_opened_file blocks and uses actual message", async () => {
      const sessionId = "test-session-1";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<ide_opened_file>The user opened the file /path/to/file.ts in the IDE. This may or may not be related.</ide_opened_file>",
            },
            {
              type: "text",
              text: "What does this function do?",
            },
          ],
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(
        sessionId,
        "test-project" as UrlProjectId,
      );
      expect(summary?.title).toBe("What does this function do?");
    });

    it("skips ide_selection blocks and uses actual message", async () => {
      const sessionId = "test-session-2";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<ide_selection>The user selected lines 1-10 from /path/file.ts:\nfunction foo() { }</ide_selection>",
            },
            {
              type: "text",
              text: "Can you explain this code?",
            },
          ],
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      expect(summary?.title).toBe("Can you explain this code?");
    });

    it("handles messages with only IDE metadata", async () => {
      const sessionId = "test-session-3";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<ide_opened_file>The user opened the file /path/to/file.ts in the IDE.</ide_opened_file>",
            },
          ],
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      // When all blocks are IDE metadata, title is null (empty content)
      expect(summary?.title).toBeNull();
    });

    it("handles mixed IDE metadata and regular text in single block", async () => {
      const sessionId = "test-session-4";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content:
            "<ide_opened_file>The user opened file.ts in the IDE.</ide_opened_file>What is this?",
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      expect(summary?.title).toBe("What is this?");
    });

    it("truncates long titles to 120 chars with ellipsis", async () => {
      const sessionId = "test-session-5";
      const longMessage =
        "This is a very long message that should be truncated because it exceeds the maximum title length which is now 120 characters so we need an even longer test string here";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: longMessage,
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      expect(summary?.title?.length).toBe(120);
      expect(summary?.title?.endsWith("...")).toBe(true);
    });

    it("preserves short titles without truncation", async () => {
      const sessionId = "test-session-6";
      const shortMessage = "Short message";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: shortMessage,
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      expect(summary?.title).toBe("Short message");
    });

    it("returns null title for sessions with no user messages", async () => {
      const sessionId = "test-session-7";
      const jsonl = JSON.stringify({
        type: "assistant",
        message: {
          content: "Hello!",
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(sessionId, "test-project");
      expect(summary?.title).toBeNull();
    });

    it("handles multiple IDE metadata blocks followed by message", async () => {
      const sessionId = "test-session-8";
      const jsonl = JSON.stringify({
        type: "user",
        message: {
          content: [
            {
              type: "text",
              text: "<ide_opened_file>The user opened file1.ts in the IDE.</ide_opened_file>",
            },
            {
              type: "text",
              text: "<ide_opened_file>The user opened file2.ts in the IDE.</ide_opened_file>",
            },
            {
              type: "text",
              text: "<ide_selection>Selected code here</ide_selection>",
            },
            {
              type: "text",
              text: "Help me refactor these files",
            },
          ],
        },
        uuid: "msg-1",
        timestamp: new Date().toISOString(),
      });
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(
        sessionId,
        "test-project" as UrlProjectId,
      );
      expect(summary?.title).toBe("Help me refactor these files");
    });
  });

  describe("DAG handling", () => {
    it("returns only active branch messages, filtering dead branches", async () => {
      const sessionId = "dag-test-1";
      // Structure:
      // a -> b -> c (dead branch, earlier lineIndex)
      //   \-> d -> e (active branch, later lineIndex)
      const jsonl = [
        JSON.stringify({
          type: "user",
          uuid: "a",
          parentUuid: null,
          message: { content: "First" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "b",
          parentUuid: "a",
          message: { content: "Dead branch response" },
        }),
        JSON.stringify({
          type: "user",
          uuid: "c",
          parentUuid: "b",
          message: { content: "Dead branch follow-up" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "d",
          parentUuid: "a",
          message: { content: "Active branch response" },
        }),
        JSON.stringify({
          type: "user",
          uuid: "e",
          parentUuid: "d",
          message: { content: "Active branch follow-up" },
        }),
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const loadedSession = await reader.getSession(
        sessionId,
        "test-project" as UrlProjectId,
      );
      const session = loadedSession ? normalizeSession(loadedSession) : null;

      expect(session?.messages).toHaveLength(3); // a, d, e (not b, c)
      expect(session?.messages.map((m) => m.uuid)).toEqual(["a", "d", "e"]);
    });

    it("marks orphaned tool calls with orphanedToolUseIds", async () => {
      const sessionId = "dag-test-2";
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          uuid: "a",
          parentUuid: null,
          message: {
            content: [
              { type: "tool_use", id: "tool-1", name: "Read", input: {} },
            ],
          },
        }),
        // No tool_result for tool-1 (orphaned - process killed)
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const loadedSession = await reader.getSession(
        sessionId,
        "test-project" as UrlProjectId,
        undefined,
        {
          includeOrphans: true,
        },
      );
      const session = loadedSession ? normalizeSession(loadedSession) : null;

      expect(session?.messages).toHaveLength(1);
      expect(session?.messages[0]?.orphanedToolUseIds).toEqual(["tool-1"]);
    });

    it("does not mark completed tools as orphaned", async () => {
      const sessionId = "dag-test-3";
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          uuid: "a",
          parentUuid: null,
          message: {
            content: [
              { type: "tool_use", id: "tool-1", name: "Read", input: {} },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          uuid: "b",
          parentUuid: "a",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "file contents",
              },
            ],
          },
        }),
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const loadedSession = await reader.getSession(
        sessionId,
        "test-project" as UrlProjectId,
        undefined,
        {
          includeOrphans: true,
        },
      );
      const session = loadedSession ? normalizeSession(loadedSession) : null;

      expect(session?.messages).toHaveLength(2);
      // First message has tool_use but it has a result, so no orphanedToolUseIds
      expect(session?.messages[0]?.orphanedToolUseIds).toBeUndefined();
    });

    it("handles mix of completed and orphaned tools", async () => {
      const sessionId = "dag-test-4";
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          uuid: "a",
          parentUuid: null,
          message: {
            content: [
              { type: "tool_use", id: "tool-1", name: "Read", input: {} },
              { type: "tool_use", id: "tool-2", name: "Bash", input: {} },
            ],
          },
        }),
        JSON.stringify({
          type: "user",
          uuid: "b",
          parentUuid: "a",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "tool-1",
                content: "result for tool-1",
              },
              // No result for tool-2 (orphaned)
            ],
          },
        }),
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const loadedSession = await reader.getSession(
        sessionId,
        "test-project",
        undefined,
        {
          includeOrphans: true,
        },
      );
      const session = loadedSession ? normalizeSession(loadedSession) : null;

      expect(session?.messages).toHaveLength(2);
      // tool-2 is orphaned but tool-1 is not
      expect(session?.messages[0]?.orphanedToolUseIds).toEqual(["tool-2"]);
    });

    it("finds tool_results on sibling branches for parallel tool calls", async () => {
      // This tests the parallel tool call structure observed in real sessions.
      // When Claude makes parallel tool calls, the SDK writes them as a chain
      // where each tool_use is a child of the previous one. Tool_results are
      // written as children of their corresponding tool_use, creating branches.
      //
      // Structure:
      //   tool_use #1 (Read file A)
      //   ├── tool_use #2 (Read file B)
      //   │   └── tool_result for B → continues to tip
      //   └── tool_result for A (sibling branch, no children - "dead branch")
      //
      // The tool_result for A is on a dead branch but is still valid!
      const sessionId = "dag-parallel-tools";
      const jsonl = [
        JSON.stringify({
          type: "assistant",
          uuid: "tool-use-1",
          parentUuid: null,
          message: {
            content: [
              { type: "tool_use", id: "read-file-a", name: "Read", input: {} },
            ],
          },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "tool-use-2",
          parentUuid: "tool-use-1",
          message: {
            content: [
              { type: "tool_use", id: "read-file-b", name: "Read", input: {} },
            ],
          },
        }),
        // Tool result for file A - has same parent as tool-use-2, creating a branch
        JSON.stringify({
          type: "user",
          uuid: "result-a",
          parentUuid: "tool-use-1",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "read-file-a",
                content: "contents of file A",
              },
            ],
          },
        }),
        // Tool result for file B - child of tool-use-2, on the "winning" branch
        JSON.stringify({
          type: "user",
          uuid: "result-b",
          parentUuid: "tool-use-2",
          message: {
            content: [
              {
                type: "tool_result",
                tool_use_id: "read-file-b",
                content: "contents of file B",
              },
            ],
          },
        }),
        // Conversation continues from result-b
        JSON.stringify({
          type: "assistant",
          uuid: "response",
          parentUuid: "result-b",
          message: {
            content: [{ type: "text", text: "Here are the file contents..." }],
          },
        }),
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const loadedSession = await reader.getSession(
        sessionId,
        "test-project" as UrlProjectId,
        undefined,
        { includeOrphans: true },
      );
      const session = loadedSession ? normalizeSession(loadedSession) : null;

      // Active branch: tool-use-1 -> tool-use-2 -> result-b -> response
      // result-a is on a sibling branch but is now INCLUDED in the output
      // (inserted after its parent tool-use-1) so the client can pair it
      expect(session?.messages).toHaveLength(5);
      expect(session?.messages.map((m) => m.uuid)).toEqual([
        "tool-use-1",
        "result-a", // sibling tool result, inserted after parent
        "tool-use-2",
        "result-b",
        "response",
      ]);

      // CRITICAL: Both tool_uses should NOT be marked as orphaned
      // because we scan ALL messages for tool_results, not just the active branch
      expect(session?.messages[0]?.orphanedToolUseIds).toBeUndefined();
      expect(session?.messages[2]?.orphanedToolUseIds).toBeUndefined(); // tool-use-2 is now at index 2
    });
  });

  describe("getAgentSession", () => {
    it("reads agent JSONL file and returns messages", async () => {
      // Copy fixture to test directory
      const fixtureContent = await readFile(
        join(fixturesDir, "agent-completed.jsonl"),
        "utf-8",
      );
      await writeFile(join(testDir, "agent-test123.jsonl"), fixtureContent);

      const result = await reader.getAgentSession("test123");

      // Should have messages (system, user, assistant messages + result)
      expect(result.messages.length).toBeGreaterThan(0);
      expect(result.status).toBe("completed");
    });

    it("returns empty for missing agent file", async () => {
      const result = await reader.getAgentSession("nonexistent");

      expect(result.messages).toHaveLength(0);
      expect(result.status).toBe("pending");
    });

    it("infers completed status from result message", async () => {
      const fixtureContent = await readFile(
        join(fixturesDir, "agent-completed.jsonl"),
        "utf-8",
      );
      await writeFile(
        join(testDir, "agent-completed-test.jsonl"),
        fixtureContent,
      );

      const result = await reader.getAgentSession("completed-test");

      expect(result.status).toBe("completed");
    });

    it("infers failed status from error result", async () => {
      const fixtureContent = await readFile(
        join(fixturesDir, "agent-failed.jsonl"),
        "utf-8",
      );
      await writeFile(join(testDir, "agent-failed-test.jsonl"), fixtureContent);

      const result = await reader.getAgentSession("failed-test");

      expect(result.status).toBe("failed");
    });

    it("infers running status from incomplete session", async () => {
      const fixtureContent = await readFile(
        join(fixturesDir, "agent-running.jsonl"),
        "utf-8",
      );
      await writeFile(
        join(testDir, "agent-running-test.jsonl"),
        fixtureContent,
      );

      const result = await reader.getAgentSession("running-test");

      expect(result.status).toBe("running");
    });

    it("returns pending for empty agent file", async () => {
      await writeFile(join(testDir, "agent-empty.jsonl"), "");

      const result = await reader.getAgentSession("empty");

      expect(result.messages).toHaveLength(0);
      expect(result.status).toBe("pending");
    });

    it("applies DAG filtering to agent messages", async () => {
      // Create agent with branching structure
      const jsonl = [
        JSON.stringify({
          type: "user",
          uuid: "a",
          parentUuid: null,
          message: { content: "First" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "b",
          parentUuid: "a",
          message: { content: "Dead branch" },
        }),
        JSON.stringify({
          type: "assistant",
          uuid: "c",
          parentUuid: "a",
          message: { content: "Active branch" },
        }),
        JSON.stringify({
          type: "result",
          uuid: "d",
          parentUuid: "c",
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-dag-test.jsonl"), jsonl);

      const result = await reader.getAgentSession("dag-test");

      // Should only have a, c, d (not b - dead branch)
      expect(result.messages).toHaveLength(3);
      expect(result.messages.map((m) => m.uuid)).toEqual(["a", "c", "d"]);
      expect(result.status).toBe("completed");
    });
  });

  describe("getAgentMappings", () => {
    it("returns mappings of toolUseId to agentId", async () => {
      // Create agent files with parent_tool_use_id
      const agent1 = [
        JSON.stringify({
          type: "system",
          uuid: "sys-1",
          parent_tool_use_id: "tool-use-abc",
        }),
        JSON.stringify({
          type: "user",
          uuid: "msg-1",
          message: { content: "Hello" },
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-abc123.jsonl"), agent1);

      const agent2 = [
        JSON.stringify({
          type: "system",
          uuid: "sys-2",
          parent_tool_use_id: "tool-use-def",
        }),
        JSON.stringify({
          type: "user",
          uuid: "msg-2",
          message: { content: "World" },
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-def456.jsonl"), agent2);

      const mappings = await reader.getAgentMappings();

      expect(mappings).toHaveLength(2);
      expect(mappings).toContainEqual({
        toolUseId: "tool-use-abc",
        agentId: "abc123",
      });
      expect(mappings).toContainEqual({
        toolUseId: "tool-use-def",
        agentId: "def456",
      });
    });

    it("returns empty array when no agent files exist", async () => {
      const mappings = await reader.getAgentMappings();
      expect(mappings).toHaveLength(0);
    });

    it("skips agent files without parent_tool_use_id", async () => {
      // Agent file without parent_tool_use_id
      const agent1 = [
        JSON.stringify({
          type: "system",
          uuid: "sys-1",
        }),
        JSON.stringify({
          type: "user",
          uuid: "msg-1",
          message: { content: "Hello" },
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-noparent.jsonl"), agent1);

      // Agent file with parent_tool_use_id
      const agent2 = [
        JSON.stringify({
          type: "system",
          uuid: "sys-2",
          parent_tool_use_id: "tool-use-xyz",
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-hasparent.jsonl"), agent2);

      const mappings = await reader.getAgentMappings();

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toEqual({
        toolUseId: "tool-use-xyz",
        agentId: "hasparent",
      });
    });

    it("handles empty agent files", async () => {
      await writeFile(join(testDir, "agent-empty.jsonl"), "");

      const mappings = await reader.getAgentMappings();
      expect(mappings).toHaveLength(0);
    });

    it("ignores non-agent JSONL files", async () => {
      // Create a regular session file
      const session = [
        JSON.stringify({
          type: "user",
          uuid: "msg-1",
          parent_tool_use_id: "should-be-ignored",
          message: { content: "Hello" },
        }),
      ].join("\n");
      await writeFile(join(testDir, "session123.jsonl"), session);

      const mappings = await reader.getAgentMappings();
      expect(mappings).toHaveLength(0);
    });

    it("finds parent_tool_use_id even if not on first line", async () => {
      // parent_tool_use_id on third line
      const agent = [
        JSON.stringify({
          type: "system",
          uuid: "sys-1",
        }),
        JSON.stringify({
          type: "config",
          uuid: "cfg-1",
        }),
        JSON.stringify({
          type: "init",
          uuid: "init-1",
          parent_tool_use_id: "tool-use-later",
        }),
      ].join("\n");
      await writeFile(join(testDir, "agent-later.jsonl"), agent);

      const mappings = await reader.getAgentMappings();

      expect(mappings).toHaveLength(1);
      expect(mappings[0]).toEqual({
        toolUseId: "tool-use-later",
        agentId: "later",
      });
    });
  });

  describe("context usage with compaction", () => {
    /** Helper to create an assistant message with usage data */
    function assistantMsg(
      uuid: string,
      parentUuid: string | null,
      inputTokens: number,
      cacheRead = 0,
      cacheCreate = 0,
    ) {
      return JSON.stringify({
        type: "assistant",
        uuid,
        parentUuid,
        message: {
          content: [{ type: "text", text: "response" }],
          model: "claude-opus-4-5-20251101",
          usage: {
            input_tokens: inputTokens,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheCreate,
            output_tokens: 100,
          },
        },
        timestamp: new Date().toISOString(),
      });
    }

    /** Helper to create a user message */
    function userMsg(uuid: string, parentUuid: string | null) {
      return JSON.stringify({
        type: "user",
        uuid,
        parentUuid,
        message: { content: "question" },
        timestamp: new Date().toISOString(),
      });
    }

    /** Helper to create a compact_boundary entry */
    function compactBoundary(
      uuid: string,
      logicalParentUuid: string,
      preTokens: number,
    ) {
      return JSON.stringify({
        type: "system",
        subtype: "compact_boundary",
        uuid,
        parentUuid: null,
        logicalParentUuid,
        content: "Conversation compacted",
        compactMetadata: { trigger: "auto", preTokens },
        timestamp: new Date().toISOString(),
      });
    }

    /** Helper to create a compact summary user message */
    function compactSummary(uuid: string, parentUuid: string) {
      return JSON.stringify({
        type: "user",
        uuid,
        parentUuid,
        isCompactSummary: true,
        isVisibleInTranscriptOnly: true,
        message: { content: "Summary of previous conversation..." },
        timestamp: new Date().toISOString(),
      });
    }

    it("reports correct percentage without compaction", async () => {
      const sessionId = "ctx-no-compact";
      const jsonl = [
        userMsg("u1", null),
        // 80K tokens out of 200K = 40%
        assistantMsg("a1", "u1", 1, 60000, 20000),
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(
        sessionId,
        "test-project" as UrlProjectId,
      );
      expect(summary?.contextUsage?.percentage).toBe(40);
      expect(summary?.contextUsage?.inputTokens).toBe(80001);
    });

    it("adjusts percentage after single compaction using preTokens overhead", async () => {
      const sessionId = "ctx-single-compact";
      // Pre-compaction: assistant at 160K tokens
      // Compaction triggers at preTokens=167K (overhead = 167K - 160K = 7K)
      // Post-compaction: assistant at 50K tokens
      // Adjusted: 50K + 7K = 57K → 29%
      const jsonl = [
        userMsg("u1", null),
        assistantMsg("a1", "u1", 1, 150000, 10000), // 160001 tokens
        compactBoundary("cb1", "a1", 167000),
        compactSummary("summary1", "cb1"),
        assistantMsg("a2", "summary1", 1, 40000, 10000), // 50001 tokens raw
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(
        sessionId,
        "test-project" as UrlProjectId,
      );
      // overhead = 167000 - 160001 = 6999
      // adjusted = 50001 + 6999 = 57000
      // percentage = round(57000 / 200000 * 100) = 28%
      expect(summary?.contextUsage?.inputTokens).toBe(57000);
      expect(summary?.contextUsage?.percentage).toBe(28);
    });

    it("adjusts percentage after multiple compactions", async () => {
      const sessionId = "ctx-multi-compact";
      // First compaction: assistant at 160K, preTokens=167K (overhead=7K)
      // After first compaction: assistant grows to 89K
      // Second compaction: preTokens=168K (new overhead = 168K - 89K = 79K)
      // After second compaction: assistant at 50K
      // Adjusted: 50K + 79K = 129K → 65%
      const t = () => new Date().toISOString();
      const jsonl = [
        userMsg("u1", null),
        assistantMsg("a1", "u1", 1, 150000, 10000), // 160001
        compactBoundary("cb1", "a1", 167000),
        compactSummary("s1", "cb1"),
        assistantMsg("a2", "s1", 1, 79000, 10000), // 89001 raw
        userMsg("u2", "a2"),
        assistantMsg("a3", "u2", 1, 79000, 10000), // 89001
        compactBoundary("cb2", "a3", 168000),
        compactSummary("s2", "cb2"),
        assistantMsg("a4", "s2", 1, 40000, 10000), // 50001 raw
      ].join("\n");
      await writeFile(join(testDir, `${sessionId}.jsonl`), `${jsonl}\n`);

      const summary = await reader.getSessionSummary(
        sessionId,
        "test-project" as UrlProjectId,
      );
      // Uses LAST compaction: overhead = 168000 - 89001 = 78999
      // adjusted = 50001 + 78999 = 129000
      // percentage = round(129000 / 200000 * 100) = 65%
      expect(summary?.contextUsage?.inputTokens).toBe(129000);
      expect(summary?.contextUsage?.percentage).toBe(65);
    });
  });

  describe("computeCompactionOverhead", () => {
    function makeAssistant(
      inputTokens: number,
      cacheRead = 0,
      cacheCreate = 0,
    ): ClaudeSessionEntry {
      return {
        type: "assistant",
        message: {
          usage: {
            input_tokens: inputTokens,
            cache_read_input_tokens: cacheRead,
            cache_creation_input_tokens: cacheCreate,
          },
        },
      } as ClaudeSessionEntry;
    }

    function makeCompactBoundary(preTokens: number): ClaudeSessionEntry {
      return {
        type: "system",
        subtype: "compact_boundary",
        compactMetadata: { trigger: "auto", preTokens },
      } as ClaudeSessionEntry;
    }

    it("returns 0 with no compaction", () => {
      const messages: ClaudeSessionEntry[] = [
        { type: "user" } as ClaudeSessionEntry,
        makeAssistant(1, 50000, 10000),
      ];
      expect(computeCompactionOverhead(messages)).toBe(0);
    });

    it("computes overhead from last compaction", () => {
      const messages = [
        makeAssistant(1, 150000, 10000), // 160001 total
        makeCompactBoundary(167000), // preTokens=167000
        { type: "user" } as ClaudeSessionEntry,
        makeAssistant(1, 40000, 10000), // post-compaction
      ];
      // overhead = 167000 - 160001 = 6999
      expect(computeCompactionOverhead(messages)).toBe(6999);
    });

    it("uses only the LAST compaction boundary", () => {
      const messages = [
        makeAssistant(1, 150000, 10000), // 160001
        makeCompactBoundary(167000), // first compaction
        makeAssistant(1, 79000, 10000), // 89001 post-first
        makeCompactBoundary(168000), // second compaction
        makeAssistant(1, 40000, 10000), // post-second
      ];
      // Uses last compaction: overhead = 168000 - 89001 = 78999
      expect(computeCompactionOverhead(messages)).toBe(78999);
    });

    it("returns 0 when compact_boundary has no compactMetadata", () => {
      const messages = [
        makeAssistant(1, 150000, 10000),
        { type: "system", subtype: "compact_boundary" } as ClaudeSessionEntry, // no metadata
        makeAssistant(1, 40000, 10000),
      ];
      expect(computeCompactionOverhead(messages)).toBe(0);
    });

    it("returns 0 when no assistant before compaction", () => {
      const messages = [
        makeCompactBoundary(167000),
        makeAssistant(1, 40000, 10000),
      ];
      expect(computeCompactionOverhead(messages)).toBe(0);
    });

    it("clamps negative overhead to 0", () => {
      const messages = [
        makeAssistant(1, 170000, 10000), // 180001 > preTokens
        makeCompactBoundary(167000),
        makeAssistant(1, 40000, 10000),
      ];
      expect(computeCompactionOverhead(messages)).toBe(0);
    });
  });
});
