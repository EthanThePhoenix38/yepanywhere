import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { editRenderer } from "../EditRenderer";

vi.mock("../../../../contexts/SchemaValidationContext", () => ({
  useSchemaValidationContext: () => ({
    enabled: false,
    reportValidationError: vi.fn(),
    isToolIgnored: vi.fn(() => false),
    ignoreToolErrors: vi.fn(),
    clearIgnoredTools: vi.fn(),
    ignoredTools: [],
  }),
}));

const renderContext = {
  isStreaming: false,
  theme: "dark" as const,
};
if (!editRenderer.renderCollapsedPreview) {
  throw new Error("Edit renderer must provide collapsed preview");
}
const renderCollapsedPreview = editRenderer.renderCollapsedPreview;

describe("EditRenderer collapsed preview fallback", () => {
  afterEach(() => {
    cleanup();
  });

  it("renders raw patch text for completed rows when structured patch is missing", () => {
    const input = {
      _rawPatch: [
        "*** Begin Patch",
        "*** Update File: src/example.ts",
        "@@",
        "-const x = 1;",
        "+const x = 2;",
        "*** End Patch",
      ].join("\n"),
    };

    render(
      <div>
        {renderCollapsedPreview(
          input as never,
          { ok: true } as never,
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.queryByText("Computing diff...")).toBeNull();
    expect(screen.getByText(/\*\*\* Begin Patch/)).toBeDefined();
  });

  it("keeps pending classic Edit rows on Computing diff...", () => {
    const input = {
      file_path: "src/example.ts",
      old_string: "const x = 1;",
      new_string: "const x = 2;",
    };

    render(
      <div>
        {renderCollapsedPreview(
          input as never,
          undefined,
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.getByText("Computing diff...")).toBeDefined();
  });

  it("keeps structured diff rendering unchanged when structured patch exists", () => {
    const input = {
      _structuredPatch: [
        {
          oldStart: 1,
          oldLines: 1,
          newStart: 1,
          newLines: 1,
          lines: ["-const x = 1;", "+const x = 2;"],
        },
      ],
    };

    render(
      <div>
        {renderCollapsedPreview(
          input as never,
          undefined,
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.queryByText("Computing diff...")).toBeNull();
    expect(screen.getByText("-const x = 1;")).toBeDefined();
    expect(screen.getByText("+const x = 2;")).toBeDefined();
  });

  it("renders stable fallback text when completed row has no patch data", () => {
    const input = {};

    render(
      <div>
        {renderCollapsedPreview(
          input as never,
          { ok: true } as never,
          false,
          renderContext,
        )}
      </div>,
    );

    expect(screen.queryByText("Computing diff...")).toBeNull();
    expect(screen.getByText("Patch preview unavailable")).toBeDefined();
  });
});
