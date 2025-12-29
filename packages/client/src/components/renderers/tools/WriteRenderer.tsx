import { useState } from "react";
import type { ToolRenderer, WriteInput, WriteResult } from "./types";

const MAX_LINES_COLLAPSED = 30;

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Write tool use - shows file path being written
 */
function WriteToolUse({ input }: { input: WriteInput }) {
  const fileName = getFileName(input.file_path);
  const lineCount = input.content.split("\n").length;
  return (
    <div className="write-tool-use">
      <span className="file-path">{fileName}</span>
      <span className="write-info">{lineCount} lines</span>
    </div>
  );
}

/**
 * Write tool result - shows written content with line numbers
 */
function WriteToolResult({
  result,
  isError,
}: {
  result: WriteResult;
  isError: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isError || !result?.file) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="write-error">
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Failed to write file"}
      </div>
    );
  }

  const { file } = result;
  const lines = file.content.split("\n");
  const needsCollapse = lines.length > MAX_LINES_COLLAPSED;
  const displayLines =
    needsCollapse && !isExpanded ? lines.slice(0, MAX_LINES_COLLAPSED) : lines;

  const fileName = getFileName(file.filePath);

  return (
    <div className="write-result">
      <div className="file-header">
        <span className="file-path">{fileName}</span>
        <span className="file-range">{file.numLines} lines written</span>
      </div>
      <div className="file-content-with-lines">
        <div className="line-numbers">
          {displayLines.map((_, i) => {
            const lineNum = file.startLine + i;
            return <div key={`line-${lineNum}`}>{lineNum}</div>;
          })}
          {needsCollapse && !isExpanded && <div>...</div>}
        </div>
        <pre className="line-content">
          <code>{displayLines.join("\n")}</code>
        </pre>
      </div>
      {needsCollapse && (
        <button
          type="button"
          className="expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : `Show all ${lines.length} lines`}
        </button>
      )}
    </div>
  );
}

export const writeRenderer: ToolRenderer<WriteInput, WriteResult> = {
  tool: "Write",

  renderToolUse(input, _context) {
    return <WriteToolUse input={input as WriteInput} />;
  },

  renderToolResult(result, isError, _context) {
    return <WriteToolResult result={result as WriteResult} isError={isError} />;
  },

  getUseSummary(input) {
    return getFileName((input as WriteInput).file_path);
  },

  getResultSummary(result, isError) {
    if (isError) return "Error";
    const r = result as WriteResult;
    return r?.file ? `${r.file.numLines} lines` : "File";
  },
};
