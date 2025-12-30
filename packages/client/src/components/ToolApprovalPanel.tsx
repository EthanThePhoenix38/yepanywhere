import { useCallback, useEffect, useState } from "react";
import type { InputRequest } from "../types";
import { toolRegistry } from "./renderers/tools";
import type { RenderContext } from "./renderers/types";
import { getToolSummary } from "./tools/summaries";

interface Props {
  request: InputRequest;
  onApprove: () => Promise<void>;
  onDeny: () => Promise<void>;
}

export function ToolApprovalPanel({ request, onApprove, onDeny }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const handleApprove = useCallback(async () => {
    setSubmitting(true);
    try {
      await onApprove();
    } finally {
      setSubmitting(false);
    }
  }, [onApprove]);

  const handleDeny = useCallback(async () => {
    setSubmitting(true);
    try {
      await onDeny();
    } finally {
      setSubmitting(false);
    }
  }, [onDeny]);

  // Keyboard shortcuts: Enter to approve, Escape to deny
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (submitting) return;

      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleApprove();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleDeny();
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleApprove, handleDeny, submitting]);

  // Create render context for tool preview
  const renderContext: RenderContext = {
    isStreaming: false,
    theme: "dark",
  };

  const summary = request.toolName
    ? getToolSummary(request.toolName, request.toolInput, undefined, "pending")
    : request.prompt;

  return (
    <div className="tool-approval-panel">
      <div className="tool-approval-content">
        <div className="tool-approval-header">
          <span className="tool-approval-label">Approve tool call?</span>
          <span className="tool-approval-name">{request.toolName}</span>
          <span className="tool-approval-summary">{summary}</span>
        </div>

        {request.toolName && request.toolInput !== undefined ? (
          <div className="tool-approval-preview">
            {toolRegistry.renderToolUse(
              request.toolName,
              request.toolInput,
              renderContext,
            )}
          </div>
        ) : null}
      </div>

      <div className="tool-approval-actions">
        <button
          type="button"
          className="tool-approval-btn deny"
          onClick={handleDeny}
          disabled={submitting}
        >
          Deny
          <kbd>esc</kbd>
        </button>
        <button
          type="button"
          className="tool-approval-btn approve"
          onClick={handleApprove}
          disabled={submitting}
        >
          Approve
          <kbd>↵</kbd>
        </button>
      </div>
    </div>
  );
}
