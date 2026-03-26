import { useRemoteImage } from "../../../hooks/useRemoteImage";
import type { ToolRenderer } from "./types";

interface ViewImageInput {
  path: string;
}

function getFileName(path: string): string {
  return path.split("/").pop() ?? path;
}

/**
 * ViewImage tool use - shows the image path
 */
function ViewImageToolUse({ input }: { input: ViewImageInput }) {
  return (
    <div className="viewimage-tool-use">
      <span className="viewimage-path">{input.path}</span>
    </div>
  );
}

/**
 * ViewImage tool result - fetches and displays a local image via /api/local-image
 */
function ViewImageToolResult({
  input,
  isError,
}: {
  input: ViewImageInput;
  isError: boolean;
}) {
  const apiPath = input?.path
    ? `/api/local-image?path=${encodeURIComponent(input.path)}`
    : null;
  const { url, loading, error } = useRemoteImage(apiPath);

  if (isError || error) {
    return (
      <div className="viewimage-error">{error ?? "Failed to load image"}</div>
    );
  }

  if (loading || !url) {
    return <div className="viewimage-loading">Loading image...</div>;
  }

  return (
    <div className="viewimage-result">
      <img
        className="read-image"
        src={url}
        alt={getFileName(input.path)}
        style={{ maxWidth: "100%" }}
      />
    </div>
  );
}

export const viewImageRenderer: ToolRenderer<ViewImageInput, unknown> = {
  tool: "ViewImage",
  displayName: "View Image",

  renderToolUse(input, _context) {
    return <ViewImageToolUse input={input as ViewImageInput} />;
  },

  renderToolResult(result, isError, _context, input) {
    return (
      <ViewImageToolResult input={input as ViewImageInput} isError={isError} />
    );
  },

  getUseSummary(input) {
    const path = (input as ViewImageInput)?.path ?? "";
    return getFileName(path);
  },

  getResultSummary(_result, isError) {
    return isError ? "Error" : "Image loaded";
  },
};
