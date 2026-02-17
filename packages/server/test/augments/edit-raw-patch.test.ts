import { describe, expect, it } from "vitest";
import {
  extractRawPatchFromEditInput,
  parseRawEditPatch,
} from "../../src/augments/edit-raw-patch.js";

describe("parseRawEditPatch", () => {
  it("parses a valid Codex apply_patch block into structured hunks", () => {
    const rawPatch = [
      "*** Begin Patch",
      "*** Update File: src/example.ts",
      "@@",
      " const x = 1;",
      "-const y = 1;",
      "+const y = 2;",
      "*** End Patch",
      "",
    ].join("\n");

    const parsed = parseRawEditPatch(rawPatch);

    expect(parsed).not.toBeNull();
    expect(parsed?.filePath).toBe("src/example.ts");
    expect(parsed?.structuredPatch).toHaveLength(1);
    expect(parsed?.structuredPatch[0]?.lines).toEqual([
      " const x = 1;",
      "-const y = 1;",
      "+const y = 2;",
    ]);
  });

  it("tolerates malformed patch text without throwing", () => {
    const rawPatch = [
      "*** Begin Patch",
      "*** Update File: src/example.ts",
      "this is not a hunk",
      "*** End Patch",
      "",
    ].join("\n");

    expect(() => parseRawEditPatch(rawPatch)).not.toThrow();
    const parsed = parseRawEditPatch(rawPatch);
    expect(parsed).not.toBeNull();
    expect(parsed?.structuredPatch).toEqual([]);
  });
});

describe("extractRawPatchFromEditInput", () => {
  it("extracts raw patch text from nested object shapes", () => {
    const rawPatch = "*** Begin Patch\n*** End Patch\n";
    const extracted = extractRawPatchFromEditInput({
      input: { patch: rawPatch },
    });
    expect(extracted).toBe(rawPatch);
  });
});
