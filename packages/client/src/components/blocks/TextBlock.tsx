import { memo, useCallback, useContext, useMemo, useState } from "react";
import type { Components, ExtraProps } from "react-markdown";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { AgentContentContext } from "../../contexts/AgentContentContext";
import { splitTextWithFilePaths } from "../../lib/filePathDetection";
import { FilePathLink } from "../FilePathLink";

interface Props {
  text: string;
  isStreaming?: boolean;
}

/**
 * Render text with file paths as clickable links.
 */
function TextWithFilePaths({
  children,
  projectId,
}: { children: string; projectId: string }) {
  const segments = splitTextWithFilePaths(children);

  return (
    <>
      {segments.map((segment, i) => {
        if (segment.type === "text") {
          return segment.content;
        }
        const { detected } = segment;
        return (
          <FilePathLink
            key={`${detected.startIndex}-${detected.filePath}`}
            filePath={detected.filePath}
            projectId={projectId}
            lineNumber={detected.lineNumber}
            columnNumber={detected.columnNumber}
            displayText={detected.match}
            showFullPath
          />
        );
      })}
    </>
  );
}

export const TextBlock = memo(function TextBlock({
  text,
  isStreaming = false,
}: Props) {
  const [copied, setCopied] = useState(false);
  const agentContext = useContext(AgentContentContext);
  const projectId = agentContext?.projectId;

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text:", err);
    }
  }, [text]);

  // Create custom markdown components that render file paths as links.
  // Only process text nodes in non-code contexts.
  // Skip file path detection during streaming to avoid expensive re-processing
  // on every delta - file paths will be detected once streaming completes.
  const markdownComponents = useMemo<Components>(() => {
    if (!projectId || isStreaming) return {};

    // Helper to process children and detect file paths in strings
    const processChildren = (children: React.ReactNode): React.ReactNode => {
      if (!children) return children;

      // Process array of children
      if (Array.isArray(children)) {
        return children.map((child, index) => {
          if (typeof child === "string") {
            return (
              <TextWithFilePaths key={`text-${index}`} projectId={projectId}>
                {child}
              </TextWithFilePaths>
            );
          }
          return child;
        });
      }

      // Process single string child
      if (typeof children === "string") {
        return (
          <TextWithFilePaths projectId={projectId}>
            {children}
          </TextWithFilePaths>
        );
      }

      return children;
    };

    return {
      // Process text in paragraphs
      p: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"p"> & ExtraProps) => (
        <p {...props}>{processChildren(children)}</p>
      ),
      // Process text in list items
      li: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"li"> & ExtraProps) => (
        <li {...props}>{processChildren(children)}</li>
      ),
      // Process text in table cells
      td: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"td"> & ExtraProps) => (
        <td {...props}>{processChildren(children)}</td>
      ),
      th: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"th"> & ExtraProps) => (
        <th {...props}>{processChildren(children)}</th>
      ),
      // Process text in blockquotes
      blockquote: ({
        children,
        ...props
      }: React.ComponentPropsWithoutRef<"blockquote"> & ExtraProps) => (
        <blockquote {...props}>{processChildren(children)}</blockquote>
      ),
      // Note: We intentionally skip code and pre elements to avoid
      // processing file paths inside code blocks
    };
  }, [projectId, isStreaming]);

  return (
    <div
      className={`text-block timeline-item${isStreaming ? " streaming" : ""}`}
    >
      <button
        type="button"
        className={`text-block-copy ${copied ? "copied" : ""}`}
        onClick={handleCopy}
        title={copied ? "Copied!" : "Copy markdown"}
        aria-label={copied ? "Copied!" : "Copy markdown"}
      >
        {copied ? <CheckIcon /> : <CopyIcon />}
      </button>
      <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
        {text}
      </Markdown>
    </div>
  );
});

function CopyIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="5" y="5" width="9" height="9" rx="1.5" />
      <path d="M11 5V3.5A1.5 1.5 0 0 0 9.5 2H3.5A1.5 1.5 0 0 0 2 3.5v6A1.5 1.5 0 0 0 3.5 11H5" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 8.5L6.5 12L13 4" />
    </svg>
  );
}
