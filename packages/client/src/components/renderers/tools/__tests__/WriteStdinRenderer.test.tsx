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

    expect(screen.getByText(/session 90210/)).toBeDefined();
    expect(screen.getByText(/poll output/)).toBeDefined();
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

    expect(screen.getByText(/Chunk ID: ff710e/)).toBeDefined();
    expect(screen.getByText(/Wall time: 0.0518 seconds/)).toBeDefined();
    expect(screen.getByText(/ready/)).toBeDefined();
  });
});
