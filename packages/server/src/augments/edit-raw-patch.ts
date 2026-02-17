import type { PatchHunk } from "@yep-anywhere/shared";

const PATCH_START_MARKER = "*** Begin Patch";
const PATCH_END_MARKER = "*** End Patch";
const FILE_HEADER_PREFIXES = [
  "*** Update File:",
  "*** Add File:",
  "*** Delete File:",
] as const;
const HUNK_HEADER_REGEX =
  /^@@(?: -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))?)?(?: @@.*)?$/;

export interface ParsedRawEditPatch {
  structuredPatch: PatchHunk[];
  filePath?: string;
  rawPatch: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function extractFilePath(line: string): string | undefined {
  for (const prefix of FILE_HEADER_PREFIXES) {
    if (line.startsWith(prefix)) {
      return line.slice(prefix.length).trim();
    }
  }
  return undefined;
}

function countOldLines(lines: string[]): number {
  let count = 0;
  for (const line of lines) {
    const prefix = line[0];
    if (prefix === " " || prefix === "-") {
      count++;
    }
  }
  return count;
}

function countNewLines(lines: string[]): number {
  let count = 0;
  for (const line of lines) {
    const prefix = line[0];
    if (prefix === " " || prefix === "+") {
      count++;
    }
  }
  return count;
}

export function extractRawPatchFromEditInput(
  input: unknown,
): string | undefined {
  if (typeof input === "string") {
    return input;
  }

  if (!isRecord(input)) {
    return undefined;
  }

  const directKeys = [
    "patch",
    "rawPatch",
    "raw_patch",
    "content",
    "text",
    "raw",
  ];
  for (const key of directKeys) {
    const value = input[key];
    if (typeof value === "string") {
      return value;
    }
  }

  const nestedInput = input.input;
  if (typeof nestedInput === "string") {
    return nestedInput;
  }
  if (isRecord(nestedInput)) {
    return extractRawPatchFromEditInput(nestedInput);
  }

  return undefined;
}

export function parseRawEditPatch(rawPatch: string): ParsedRawEditPatch | null {
  try {
    if (!rawPatch.includes(PATCH_START_MARKER)) {
      return null;
    }

    const lines = rawPatch.replace(/\r\n/g, "\n").split("\n");
    const structuredPatch: PatchHunk[] = [];

    let filePath: string | undefined;
    let inPatch = false;
    let nextOldStart = 1;
    let nextNewStart = 1;

    let i = 0;
    while (i < lines.length) {
      const line = lines[i] ?? "";

      if (!inPatch) {
        if (line === PATCH_START_MARKER) {
          inPatch = true;
        }
        i++;
        continue;
      }

      if (line === PATCH_END_MARKER) {
        break;
      }

      const headerFilePath = extractFilePath(line);
      if (!filePath && headerFilePath) {
        filePath = headerFilePath;
        i++;
        continue;
      }

      const headerMatch = line.match(HUNK_HEADER_REGEX);
      if (!headerMatch) {
        i++;
        continue;
      }

      const oldStartRaw = headerMatch[1];
      const oldLinesRaw = headerMatch[2];
      const newStartRaw = headerMatch[3];
      const newLinesRaw = headerMatch[4];
      const hasRanges = oldStartRaw !== undefined && newStartRaw !== undefined;

      const hunkLines: string[] = [];
      i++;

      while (i < lines.length) {
        const hunkLine = lines[i] ?? "";
        if (
          hunkLine === PATCH_END_MARKER ||
          hunkLine.startsWith("@@") ||
          extractFilePath(hunkLine)
        ) {
          break;
        }
        if (hunkLine === "\\ No newline at end of file") {
          i++;
          continue;
        }

        const prefix = hunkLine[0];
        if (prefix === " " || prefix === "-" || prefix === "+") {
          hunkLines.push(hunkLine);
        }

        i++;
      }

      if (hunkLines.length === 0) {
        continue;
      }

      const oldStart = hasRanges ? Number(oldStartRaw) : nextOldStart;
      const newStart = hasRanges ? Number(newStartRaw) : nextNewStart;
      const oldLines = hasRanges
        ? Number(oldLinesRaw ?? "1")
        : countOldLines(hunkLines);
      const newLines = hasRanges
        ? Number(newLinesRaw ?? "1")
        : countNewLines(hunkLines);

      structuredPatch.push({
        oldStart,
        oldLines,
        newStart,
        newLines,
        lines: hunkLines,
      });

      nextOldStart = oldStart + oldLines;
      nextNewStart = newStart + newLines;
    }

    return {
      structuredPatch,
      filePath,
      rawPatch,
    };
  } catch {
    return null;
  }
}
