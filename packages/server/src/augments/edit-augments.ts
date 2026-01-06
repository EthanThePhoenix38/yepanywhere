/**
 * Edit augment service - computes structuredPatch and highlighted diff HTML
 * for Edit tool_use blocks.
 *
 * This enables consistent unified diff display for both pending (tool_use)
 * and completed (tool_result) edits.
 */

import type { EditAugment, PatchHunk } from "@yep-anywhere/shared";
import { diffWords, structuredPatch } from "diff";
import { getLanguageForPath, highlightCode } from "../highlighting/index.js";

/** Number of context lines to include in the diff */
const CONTEXT_LINES = 3;

/**
 * Input for computing an edit augment.
 */
export interface EditInput {
  file_path: string;
  old_string: string;
  new_string: string;
}

/**
 * Convert jsdiff patch hunks to our PatchHunk format.
 * jsdiff hunks have the same structure but we need to add line prefixes.
 */
function convertHunks(
  hunks: Array<{
    oldStart: number;
    oldLines: number;
    newStart: number;
    newLines: number;
    lines: string[];
  }>,
): PatchHunk[] {
  return hunks.map((hunk) => ({
    oldStart: hunk.oldStart,
    oldLines: hunk.oldLines,
    newStart: hunk.newStart,
    newLines: hunk.newLines,
    // Filter out "\ No newline at end of file" - not useful for UI display
    lines: hunk.lines.filter((line) => line !== "\\ No newline at end of file"),
  }));
}

/**
 * Convert structured patch hunks to unified diff text for highlighting.
 */
function patchToUnifiedText(hunks: PatchHunk[]): string {
  const lines: string[] = [];

  for (const hunk of hunks) {
    // Add hunk header
    lines.push(
      `@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`,
    );
    // Add diff lines (already prefixed with ' ', '-', or '+')
    lines.push(...hunk.lines);
  }

  return lines.join("\n");
}

/**
 * Extract the inner content of each <span class="line">...</span> from Shiki HTML.
 * Handles nested spans by counting depth.
 */
function extractShikiLines(html: string): string[] {
  const lines: string[] = [];
  const lineStartRegex = /<span class="line">/g;
  let match: RegExpExecArray | null;

  while ((match = lineStartRegex.exec(html)) !== null) {
    const startPos = match.index + match[0].length;
    let depth = 1;
    let pos = startPos;

    // Find the matching closing </span> by tracking nesting depth
    while (depth > 0 && pos < html.length) {
      const nextOpen = html.indexOf("<span", pos);
      const nextClose = html.indexOf("</span>", pos);

      if (nextClose === -1) break;

      if (nextOpen !== -1 && nextOpen < nextClose) {
        depth++;
        pos = nextOpen + 5; // Move past "<span"
      } else {
        depth--;
        if (depth === 0) {
          lines.push(html.slice(startPos, nextClose));
        }
        pos = nextClose + 7; // Move past "</span>"
      }
    }
  }

  return lines;
}

/**
 * Build syntax-highlighted diff HTML by highlighting old_string and new_string
 * separately with the file's language, then reconstructing the diff.
 *
 * @returns Highlighted HTML or null if language is unknown/unsupported
 */
async function highlightDiffWithSyntax(
  oldString: string,
  newString: string,
  hunks: PatchHunk[],
  filePath: string,
): Promise<string | null> {
  // Detect language from file extension
  const lang = getLanguageForPath(filePath);
  if (!lang) return null;

  // Highlight both strings with the file's language
  // Handle empty strings - highlightCode returns null for empty input
  const oldResult =
    oldString.length > 0 ? await highlightCode(oldString, lang) : null;
  const newResult =
    newString.length > 0 ? await highlightCode(newString, lang) : null;

  // If both fail (not just empty), fall back
  if (!oldResult && oldString.length > 0) return null;
  if (!newResult && newString.length > 0) return null;

  // Extract lines from Shiki HTML
  const oldLines = oldResult ? extractShikiLines(oldResult.html) : [];
  const newLines = newResult ? extractShikiLines(newResult.html) : [];

  // Build diff HTML by mapping hunk lines to highlighted source lines
  const resultLines: string[] = [];

  for (const hunk of hunks) {
    // Add hunk header (hidden by CSS but needed for tests)
    resultLines.push(
      `<span class="line line-hunk">@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@</span>`,
    );

    let oldIdx = hunk.oldStart - 1; // 0-indexed
    let newIdx = hunk.newStart - 1;

    for (const line of hunk.lines) {
      const prefix = line[0];
      let lineClass: string;
      let content: string;

      if (prefix === " ") {
        // Context line - use old (identical in both)
        lineClass = "line line-context";
        content = oldLines[oldIdx++] ?? "";
        newIdx++;
      } else if (prefix === "-") {
        // Deleted line - use old
        lineClass = "line line-deleted";
        content = oldLines[oldIdx++] ?? "";
      } else if (prefix === "+") {
        // Inserted line - use new
        lineClass = "line line-inserted";
        content = newLines[newIdx++] ?? "";
      } else {
        continue; // Skip unexpected
      }

      resultLines.push(
        `<span class="${lineClass}"><span class="diff-prefix">${escapeHtml(prefix)}</span>${content}</span>`,
      );
    }
  }

  return `<pre class="shiki"><code class="language-${lang}">${resultLines.join("\n")}</code></pre>`;
}

/**
 * Compute an edit augment for an Edit tool_use.
 *
 * @param toolUseId - The tool_use ID to associate with this augment
 * @param input - The Edit tool input containing file_path, old_string, new_string
 * @returns EditAugment with structuredPatch and highlighted diff HTML
 */
export async function computeEditAugment(
  toolUseId: string,
  input: EditInput,
): Promise<EditAugment> {
  const { file_path, old_string, new_string } = input;

  // Compute structured patch using jsdiff
  const patch = structuredPatch(
    file_path,
    file_path,
    old_string,
    new_string,
    "", // oldHeader
    "", // newHeader
    { context: CONTEXT_LINES },
  );

  // Convert hunks to our format
  const structuredPatchResult = convertHunks(patch.hunks);

  // Try syntax-highlighted diff first (highlights code with file's language)
  let diffHtml = await highlightDiffWithSyntax(
    old_string,
    new_string,
    structuredPatchResult,
    file_path,
  );

  // Fall back to diff-only highlighting if syntax highlighting fails
  if (!diffHtml) {
    const diffText = patchToUnifiedText(structuredPatchResult);
    const highlightResult = await highlightCode(diffText, "diff");
    if (highlightResult) {
      // Post-process to add line type classes for background colors
      diffHtml = addDiffLineClasses(highlightResult.html);
    } else {
      // Fallback to plain text wrapped in pre/code
      diffHtml = `<pre class="shiki"><code class="language-diff">${escapeHtml(diffText)}</code></pre>`;
    }
  }

  return {
    toolUseId,
    type: "edit",
    structuredPatch: structuredPatchResult,
    diffHtml,
    filePath: file_path,
  };
}

/**
 * Add diff line type classes to shiki HTML output.
 * Detects line content and adds classes like "line-deleted", "line-inserted", "line-context", "line-hunk".
 * This enables CSS background colors for traditional diff styling.
 */
function addDiffLineClasses(html: string): string {
  // Match each <span class="line">...</span> and inspect content
  return html.replace(
    /<span class="line">([\s\S]*?)<\/span>/g,
    (_match, content: string) => {
      // Decode HTML entities to check the actual first character
      const decoded = content
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&amp;/g, "&");

      // Get the visible text (strip HTML tags)
      const textContent = decoded.replace(/<[^>]*>/g, "");
      const firstChar = textContent[0];

      let lineClass = "line";
      if (firstChar === "-") {
        lineClass = "line line-deleted";
      } else if (firstChar === "+") {
        lineClass = "line line-inserted";
      } else if (firstChar === "@") {
        lineClass = "line line-hunk";
      } else if (firstChar === " ") {
        lineClass = "line line-context";
      }

      return `<span class="${lineClass}">${content}</span>`;
    },
  );
}

/**
 * Escape HTML special characters for fallback rendering.
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * Represents a paired line in a replacement hunk (a line that was modified).
 */
interface LinePair {
  oldLineIndex: number; // Index into the removed lines array (0-based within the group)
  newLineIndex: number; // Index into the added lines array (0-based within the group)
  oldText: string; // The text content (without the - prefix)
  newText: string; // The text content (without the + prefix)
}

/**
 * Result of analyzing a hunk for replacement pairs.
 */
interface HunkReplacePairs {
  pairs: LinePair[];
  // Lines that don't have a pair (pure additions/deletions)
  unpairedRemovals: Array<{ index: number; text: string }>;
  unpairedAdditions: Array<{ index: number; text: string }>;
}

/**
 * Find consecutive -/+ line pairs in diff hunk lines that represent "replacements".
 * These pairs are candidates for word-level diffing.
 *
 * Pairing strategy:
 * - Match removed lines with added lines in order (first - with first +, etc.)
 * - If there are more - than +, extra removed lines have no pair
 * - If there are more + than -, extra added lines have no pair
 * - Context lines (space prefix) or hunk headers (@@) reset the grouping
 *
 * @param hunkLines - Array of diff lines with prefixes: ' ', '-', '+', or starting with '@@'
 * @returns Object containing pairs and unpaired lines
 */
function findReplacePairs(hunkLines: string[]): HunkReplacePairs {
  const result: HunkReplacePairs = {
    pairs: [],
    unpairedRemovals: [],
    unpairedAdditions: [],
  };

  // Collect removals and additions in the current contiguous group
  let currentRemovals: Array<{ index: number; text: string }> = [];
  let currentAdditions: Array<{ index: number; text: string }> = [];

  /**
   * Process the current group of removals and additions, creating pairs
   * and tracking unpaired lines.
   */
  function flushGroup() {
    // Pair up removals and additions in order
    const pairCount = Math.min(currentRemovals.length, currentAdditions.length);

    for (let i = 0; i < pairCount; i++) {
      const removal = currentRemovals[i];
      const addition = currentAdditions[i];
      if (removal && addition) {
        result.pairs.push({
          oldLineIndex: i,
          newLineIndex: i,
          oldText: removal.text,
          newText: addition.text,
        });
      }
    }

    // Track unpaired removals (when more - than +)
    for (let i = pairCount; i < currentRemovals.length; i++) {
      const removal = currentRemovals[i];
      if (removal) {
        result.unpairedRemovals.push(removal);
      }
    }

    // Track unpaired additions (when more + than -)
    for (let i = pairCount; i < currentAdditions.length; i++) {
      const addition = currentAdditions[i];
      if (addition) {
        result.unpairedAdditions.push(addition);
      }
    }

    // Reset for next group
    currentRemovals = [];
    currentAdditions = [];
  }

  for (const line of hunkLines) {
    const prefix = line[0];

    if (prefix === "-") {
      // If we were collecting additions, flush the group first
      // (additions after removals is normal, but - after + means new group)
      if (currentAdditions.length > 0) {
        flushGroup();
      }
      currentRemovals.push({
        index: currentRemovals.length,
        text: line.slice(1),
      });
    } else if (prefix === "+") {
      // Additions are added to current group
      currentAdditions.push({
        index: currentAdditions.length,
        text: line.slice(1),
      });
    } else if (prefix === " " || line.startsWith("@@")) {
      // Context line or hunk header - flush current group and reset
      flushGroup();
    }
    // Skip other lines (like "\ No newline at end of file")
  }

  // Flush any remaining group
  flushGroup();

  return result;
}

/**
 * Represents a segment of a word-level diff.
 */
export interface WordDiffSegment {
  text: string;
  type: "unchanged" | "removed" | "added";
}

/**
 * Compute word-level diff between two strings.
 * Uses jsdiff's diffWords to find word-by-word changes.
 *
 * @param oldLine - The original string
 * @param newLine - The modified string
 * @returns Array of diff segments with their types
 */
function computeWordDiff(oldLine: string, newLine: string): WordDiffSegment[] {
  const changes = diffWords(oldLine, newLine);

  return changes.map((change) => ({
    text: change.value,
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
  }));
}

/**
 * @internal
 * Exported for testing purposes only. Do not use in production code.
 */
export const __test__ = {
  extractShikiLines,
  addDiffLineClasses,
  convertHunks,
  patchToUnifiedText,
  escapeHtml,
  computeWordDiff,
  findReplacePairs,
};
