/**
 * Read augment service - computes syntax-highlighted HTML for Read tool_result blocks.
 *
 * This enables syntax highlighting for file content displayed in the Read tool,
 * including partial file reads (line ranges).
 *
 * Note: For partial reads, we highlight just the visible content. This works
 * correctly in most cases, but may produce incorrect highlighting if the range
 * starts mid-context (e.g., inside a multi-line comment or string).
 */

import { highlightFile } from "../highlighting/index.js";

/**
 * Input for computing a read augment.
 */
export interface ReadAugmentInput {
  file_path: string;
  content: string;
}

/**
 * Result from computing a read augment.
 */
export interface ReadAugmentResult {
  /** Syntax-highlighted HTML */
  highlightedHtml: string;
  /** Language used for highlighting */
  language: string;
  /** Whether content was truncated for highlighting */
  truncated: boolean;
}

/**
 * Compute a read augment for a Read tool_result.
 *
 * @param input - The file path and content to highlight
 * @returns ReadAugmentResult with highlighted HTML, or null if language is unsupported
 */
export async function computeReadAugment(
  input: ReadAugmentInput,
): Promise<ReadAugmentResult | null> {
  const { file_path, content } = input;

  // Use highlightFile which detects language from file extension
  const result = await highlightFile(content, file_path);
  if (!result) {
    return null;
  }

  return {
    highlightedHtml: result.html,
    language: result.language,
    truncated: result.truncated,
  };
}
