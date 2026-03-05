import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { ToolCallRow } from "../ToolCallRow";

describe("ToolCallRow", () => {
  afterEach(() => {
    cleanup();
  });

  it("keeps pending Codex Bash rows collapsed without IN/OUT preview cards", () => {
    const { container } = render(
      <ToolCallRow
        id="tool-1"
        toolName="Bash"
        toolInput={{ command: "npm run test:e2e:pipeline-v2" }}
        status="pending"
        sessionProvider="codex"
      />,
    );

    expect(screen.getByText("Bash")).toBeDefined();
    expect(screen.getByText("npm run test:e2e:pipeline-v2")).toBeDefined();
    expect(container.querySelector(".tool-row-collapsed-preview")).toBeNull();
    expect(container.querySelector(".tool-use-expanded")).toBeNull();
  });
});
