import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { writeStdinRenderer } from "../WriteStdinRenderer";

const renderContext = {
  isStreaming: false,
  theme: "dark" as const,
};

describe("WriteStdinRenderer", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders poll intent for empty chars", () => {
    render(
      <div>
        {writeStdinRenderer.renderToolUse(
          { session_id: 90210, chars: "" },
          renderContext,
        )}
      </div>,
    );

    expect(screen.getByText(/command session 90210/)).toBeDefined();
    expect(screen.getByText(/waiting for output/)).toBeDefined();
  });

  it("shows linked command when available", () => {
    render(
      <div>
        {writeStdinRenderer.renderToolUse(
          {
            session_id: 90210,
            chars: "",
            linked_command:
              "pnpm vitest packages/server/test/api/sessions.test.ts",
          },
          renderContext,
        )}
      </div>,
    );

    expect(screen.getByText(/command: pnpm vitest/)).toBeDefined();
  });

  it("extracts exit status summary from new output envelope", () => {
    const summary = writeStdinRenderer.getResultSummary?.(
      "Chunk ID: ff710e\nProcess exited with code 0\nOutput:\nready\n",
      false,
    );

    expect(summary).toBe("exit 0");
  });

  it("renders output text without JSON escaping artifacts", () => {
    render(
      <div>
        {writeStdinRenderer.renderToolResult(
          "Chunk ID: ff710e\nWall time: 0.0518 seconds\nOutput:\nready\n",
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.getByText(/ready/)).toBeDefined();
  });

  it("extracts output section from envelope metadata", () => {
    render(
      <div>
        {writeStdinRenderer.renderToolResult(
          "Chunk ID: ff710e\nWall time: 0.0518 seconds\nProcess exited with code 0\nOutput:\nline 1\nline 2\n",
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.queryByText(/Chunk ID: ff710e/)).toBeNull();
    expect(screen.queryByText(/Wall time: 0.0518 seconds/)).toBeNull();
    expect(screen.getByText(/line 1/)).toBeDefined();
    expect(screen.getByText(/line 2/)).toBeDefined();
  });
});
