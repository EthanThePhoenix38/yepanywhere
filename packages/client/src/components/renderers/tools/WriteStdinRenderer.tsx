import type { ToolRenderer, WriteStdinInput, WriteStdinResult } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getSessionId(input: unknown): string {
  if (!isRecord(input)) {
    return "unknown";
  }
  const value = input.session_id;
  if (typeof value === "number") {
    return String(value);
  }
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return "unknown";
}

function getChars(input: unknown): string | undefined {
  if (!isRecord(input) || typeof input.chars !== "string") {
    return undefined;
  }
  return input.chars;
}

function formatChars(chars: string | undefined): string {
  if (chars === undefined || chars.length === 0) {
    return "(poll)";
  }

  const escapedJson = JSON.stringify(chars);
  if (!escapedJson || escapedJson.length < 2) {
    return chars;
  }

  const escaped = escapedJson.slice(1, -1);
  if (escaped.length <= 80) {
    return escaped;
  }
  return `${escaped.slice(0, 77)}...`;
}

function getResultText(result: unknown): string {
  if (typeof result === "string") {
    return result;
  }

  if (isRecord(result) && typeof result.content === "string") {
    return result.content;
  }

  if (result === null || result === undefined) {
    return "";
  }

  if (typeof result === "number" || typeof result === "boolean") {
    return String(result);
  }

  return JSON.stringify(result, null, 2);
}

function extractExitCode(text: string): number | undefined {
  const match = text.match(
    /(?:^|\n)\s*(?:Process exited with code|Exit code:)\s*(-?\d+)\b/i,
  );
  if (!match?.[1]) {
    return undefined;
  }
  return Number.parseInt(match[1], 10);
}

export const writeStdinRenderer: ToolRenderer<
  WriteStdinInput,
  WriteStdinResult
> = {
  tool: "WriteStdin",
  displayName: "Write stdin",

  renderToolUse(input, _context) {
    const sessionId = getSessionId(input);
    const chars = getChars(input);
    const action =
      chars === undefined || chars.length === 0
        ? "poll output"
        : `send: ${formatChars(chars)}`;

    return (
      <div className="bash-tool-use">
        <pre className="code-block">
          <code>{`session ${sessionId}\n${action}`}</code>
        </pre>
      </div>
    );
  },

  renderToolResult(result, isError, _context) {
    const text = getResultText(result);
    if (!text) {
      return <div className="bash-empty">No output</div>;
    }

    return (
      <div className={`bash-result ${isError ? "bash-result-error" : ""}`}>
        <pre className={`code-block ${isError ? "code-block-error" : ""}`}>
          <code>{text}</code>
        </pre>
      </div>
    );
  },

  getUseSummary(input) {
    const sessionId = getSessionId(input);
    const chars = getChars(input);
    if (chars === undefined || chars.length === 0) {
      return `poll ${sessionId}`;
    }
    return `stdin ${sessionId}`;
  },

  getResultSummary(result, isError) {
    if (isError) {
      return "Error";
    }

    const text = getResultText(result);
    const exitCode = extractExitCode(text);
    if (exitCode !== undefined) {
      return `exit ${exitCode}`;
    }

    if (!text.trim()) {
      return "No output";
    }

    const lineCount = text.split("\n").filter(Boolean).length;
    return `${lineCount} lines`;
  },
};
