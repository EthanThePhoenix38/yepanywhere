import { useState } from "react";
import type { GlobInput, GlobResult, ToolRenderer } from "./types";

const MAX_FILES_COLLAPSED = 20;

/**
 * Extract filename from path
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * Glob tool use - shows pattern being searched
 */
function GlobToolUse({ input }: { input: GlobInput }) {
  return (
    <div className="glob-tool-use">
      <span className="glob-pattern">{input.pattern}</span>
      {input.path && <span className="glob-path">in {input.path}</span>}
    </div>
  );
}

/**
 * Glob tool result - shows list of matching files
 */
function GlobToolResult({
  result,
  isError,
}: {
  result: GlobResult;
  isError: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (isError) {
    const errorResult = result as unknown as { content?: unknown } | undefined;
    return (
      <div className="glob-error">
        {typeof result === "object" && errorResult?.content
          ? String(errorResult.content)
          : "Glob search failed"}
      </div>
    );
  }

  if (!result?.filenames || result.filenames.length === 0) {
    return <div className="glob-empty">No files found</div>;
  }

  const { filenames, numFiles, truncated } = result;
  const needsCollapse = filenames.length > MAX_FILES_COLLAPSED;
  const displayFiles =
    needsCollapse && !isExpanded
      ? filenames.slice(0, MAX_FILES_COLLAPSED)
      : filenames;

  return (
    <div className="glob-result">
      <div className="glob-header">
        <span className="glob-count">{numFiles} files</span>
        {truncated && <span className="badge badge-warning">truncated</span>}
      </div>
      <div className="file-list">
        {displayFiles.map((file) => (
          <div key={file} className="file-list-item">
            <span className="file-path">{getFileName(file)}</span>
            <span className="file-dir">{file}</span>
          </div>
        ))}
        {needsCollapse && !isExpanded && (
          <div className="file-list-more">
            ... and {filenames.length - MAX_FILES_COLLAPSED} more
          </div>
        )}
      </div>
      {needsCollapse && (
        <button
          type="button"
          className="expand-button"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? "Show less" : `Show all ${filenames.length} files`}
        </button>
      )}
    </div>
  );
}

export const globRenderer: ToolRenderer<GlobInput, GlobResult> = {
  tool: "Glob",

  renderToolUse(input, _context) {
    return <GlobToolUse input={input as GlobInput} />;
  },

  renderToolResult(result, isError, _context) {
    return <GlobToolResult result={result as GlobResult} isError={isError} />;
  },

  getUseSummary(input) {
    return (input as GlobInput).pattern;
  },

  getResultSummary(result, isError) {
    if (isError) return "Error";
    const r = result as GlobResult;
    return r?.numFiles !== undefined ? `${r.numFiles} files` : "Files";
  },
};
