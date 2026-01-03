/**
 * Tests for Gemini event schema parsing.
 */

import { describe, expect, it } from "vitest";
import { parseGeminiEvent } from "../../src/gemini-schema/events.js";

describe("parseGeminiEvent", () => {
  describe("user events", () => {
    it("should parse user message event", () => {
      const line = JSON.stringify({
        type: "user",
        content: "Hello, Gemini!",
        timestamp: "2024-01-01T00:00:00Z",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("user");
      if (event?.type === "user") {
        expect(event.content).toBe("Hello, Gemini!");
        expect(event.timestamp).toBe("2024-01-01T00:00:00Z");
      }
    });

    it("should parse user message with parts", () => {
      const line = JSON.stringify({
        type: "user",
        parts: [{ text: "Hello" }, { text: "World" }],
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("user");
    });
  });

  describe("gemini response events", () => {
    it("should parse text response", () => {
      const line = JSON.stringify({
        type: "gemini",
        text: "Hello! How can I help you?",
        finishReason: "STOP",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("gemini");
      if (event?.type === "gemini") {
        expect(event.text).toBe("Hello! How can I help you?");
        expect(event.finishReason).toBe("STOP");
      }
    });

    it("should parse response with thoughts", () => {
      const line = JSON.stringify({
        type: "gemini",
        text: "Here is the answer.",
        thoughts: [
          { subject: "Analysis", description: "Thinking about the problem..." },
          { thought: "The solution involves..." },
        ],
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("gemini");
      if (event?.type === "gemini") {
        expect(event.thoughts).toHaveLength(2);
        expect(event.thoughts?.[0].subject).toBe("Analysis");
      }
    });

    it("should parse response with token usage", () => {
      const line = JSON.stringify({
        type: "gemini",
        text: "Response text",
        tokens: {
          promptTokenCount: 100,
          candidatesTokenCount: 50,
          totalTokenCount: 150,
        },
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("gemini");
      if (event?.type === "gemini") {
        expect(event.tokens?.promptTokenCount).toBe(100);
        expect(event.tokens?.candidatesTokenCount).toBe(50);
        expect(event.tokens?.totalTokenCount).toBe(150);
      }
    });

    it("should parse response with function call", () => {
      const line = JSON.stringify({
        type: "gemini",
        parts: [
          {
            functionCall: {
              name: "read_file",
              args: { path: "/tmp/test.txt" },
            },
          },
        ],
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("gemini");
    });
  });

  describe("info events", () => {
    it("should parse info event", () => {
      const line = JSON.stringify({
        type: "info",
        message: "Session started",
        model: "gemini-2.0-pro",
        session_id: "gemini-123",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("info");
      if (event?.type === "info") {
        expect(event.message).toBe("Session started");
        expect(event.model).toBe("gemini-2.0-pro");
        expect(event.session_id).toBe("gemini-123");
      }
    });
  });

  describe("error events", () => {
    it("should parse error event", () => {
      const line = JSON.stringify({
        type: "error",
        error: "API rate limit exceeded",
        code: "RATE_LIMIT",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("error");
      if (event?.type === "error") {
        expect(event.error).toBe("API rate limit exceeded");
        expect(event.code).toBe("RATE_LIMIT");
      }
    });
  });

  describe("done events", () => {
    it("should parse done event", () => {
      const line = JSON.stringify({
        type: "done",
        tokens: {
          promptTokenCount: 200,
          candidatesTokenCount: 100,
          totalTokenCount: 300,
        },
        duration_ms: 1500,
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("done");
      if (event?.type === "done") {
        expect(event.tokens?.totalTokenCount).toBe(300);
        expect(event.duration_ms).toBe(1500);
      }
    });
  });

  describe("tool events", () => {
    it("should parse tool event", () => {
      const line = JSON.stringify({
        type: "tool",
        name: "bash",
        args: { command: "ls -la" },
        status: "running",
      });

      const event = parseGeminiEvent(line);

      expect(event).not.toBeNull();
      expect(event?.type).toBe("tool");
      if (event?.type === "tool") {
        expect(event.name).toBe("bash");
        expect(event.args).toEqual({ command: "ls -la" });
        expect(event.status).toBe("running");
      }
    });
  });

  describe("error handling", () => {
    it("should return null for invalid JSON", () => {
      const event = parseGeminiEvent("not json");
      expect(event).toBeNull();
    });

    it("should return null for empty string", () => {
      const event = parseGeminiEvent("");
      expect(event).toBeNull();
    });

    it("should handle unknown event types gracefully", () => {
      const line = JSON.stringify({
        type: "unknown_type",
        data: "some data",
      });

      const event = parseGeminiEvent(line);
      // Unknown types are returned as-is for forward compatibility
      expect(event).not.toBeNull();
    });

    it("should return null for objects without type field", () => {
      const line = JSON.stringify({
        data: "no type field",
      });

      const event = parseGeminiEvent(line);
      expect(event).toBeNull();
    });
  });
});
