import type { FileContentResponse } from "@claude-anywhere/shared";
import { memo, useCallback, useEffect, useState } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { api } from "../api/client";

interface FileViewerProps {
  projectId: string;
  filePath: string;
  onClose?: () => void;
  /** If true, renders as standalone page layout instead of modal content */
  standalone?: boolean;
}

/**
 * Format file size for display.
 */
function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Get language hint from file extension for potential future syntax highlighting.
 */
function getLanguageFromPath(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const langMap: Record<string, string> = {
    ts: "typescript",
    tsx: "typescript",
    js: "javascript",
    jsx: "javascript",
    py: "python",
    rb: "ruby",
    go: "go",
    rs: "rust",
    java: "java",
    kt: "kotlin",
    c: "c",
    cpp: "cpp",
    h: "c",
    hpp: "cpp",
    cs: "csharp",
    swift: "swift",
    php: "php",
    sql: "sql",
    sh: "bash",
    bash: "bash",
    zsh: "bash",
    json: "json",
    yaml: "yaml",
    yml: "yaml",
    toml: "toml",
    xml: "xml",
    html: "html",
    css: "css",
    scss: "scss",
    md: "markdown",
    markdown: "markdown",
  };
  return langMap[ext] || "plaintext";
}

/**
 * Check if file should render as markdown.
 */
function isMarkdownFile(filePath: string): boolean {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  return ext === "md" || ext === "markdown";
}

/**
 * Check if file is an image.
 */
function isImageFile(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Get filename from path.
 */
function getFileName(filePath: string): string {
  return filePath.split("/").pop() || filePath;
}

/**
 * FileViewer component - displays file content with appropriate formatting.
 */
export const FileViewer = memo(function FileViewer({
  projectId,
  filePath,
  onClose,
  standalone = false,
}: FileViewerProps) {
  const [fileData, setFileData] = useState<FileContentResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [renderMarkdown, setRenderMarkdown] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    api
      .getFile(projectId, filePath)
      .then((data) => {
        if (!cancelled) {
          setFileData(data);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          setError(err.message || "Failed to load file");
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [projectId, filePath]);

  const handleCopy = useCallback(async () => {
    if (!fileData?.content) return;
    try {
      await navigator.clipboard.writeText(fileData.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  }, [fileData?.content]);

  const handleDownload = useCallback(() => {
    const url = api.getFileRawUrl(projectId, filePath, true);
    window.open(url, "_blank");
  }, [projectId, filePath]);

  const handleOpenInNewTab = useCallback(() => {
    const url = `/projects/${projectId}/file?path=${encodeURIComponent(filePath)}`;
    window.open(url, "_blank");
  }, [projectId, filePath]);

  const fileName = getFileName(filePath);
  const language = getLanguageFromPath(filePath);
  const isMarkdown = isMarkdownFile(filePath);

  // Render loading state
  if (loading) {
    return (
      <div className="file-viewer">
        <div className="file-viewer-loading">Loading {fileName}...</div>
      </div>
    );
  }

  // Render error state
  if (error || !fileData) {
    return (
      <div className="file-viewer">
        <div className="file-viewer-error">{error || "File not found"}</div>
      </div>
    );
  }

  const { metadata, content, rawUrl } = fileData;
  const isImage = isImageFile(metadata.mimeType);

  // Render content based on file type
  const renderContent = () => {
    // Image files
    if (isImage) {
      return (
        <div className="file-viewer-image">
          <img src={rawUrl} alt={fileName} />
        </div>
      );
    }

    // Text files
    if (content !== undefined) {
      // Markdown rendering (toggleable)
      if (isMarkdown && renderMarkdown) {
        return (
          <div className="file-viewer-markdown">
            <Markdown remarkPlugins={[remarkGfm]}>{content}</Markdown>
          </div>
        );
      }

      // Code/text with line numbers
      const lines = content.split("\n");
      return (
        <div className="file-viewer-code" data-language={language}>
          <div className="file-viewer-line-numbers">
            {lines.map((_, i) => (
              <div key={`line-${i + 1}`}>{i + 1}</div>
            ))}
          </div>
          <pre className="file-viewer-content">
            <code>{content}</code>
          </pre>
        </div>
      );
    }

    // Binary files or files too large
    return (
      <div className="file-viewer-binary">
        <p>This file cannot be displayed inline.</p>
        <p>
          <strong>Type:</strong> {metadata.mimeType}
        </p>
        <p>
          <strong>Size:</strong> {formatFileSize(metadata.size)}
        </p>
        <button
          type="button"
          className="file-viewer-download-btn"
          onClick={handleDownload}
        >
          Download File
        </button>
      </div>
    );
  };

  // Header with file info and actions
  const header = (
    <div className="file-viewer-header">
      <div className="file-viewer-info">
        <span className="file-viewer-path" title={filePath}>
          {filePath}
        </span>
        <span className="file-viewer-meta">
          {formatFileSize(metadata.size)}
          {metadata.isText &&
            content &&
            ` \u2022 ${content.split("\n").length} lines`}
        </span>
      </div>
      <div className="file-viewer-actions">
        {isMarkdown && content && (
          <button
            type="button"
            className="file-viewer-action"
            onClick={() => setRenderMarkdown(!renderMarkdown)}
            title={renderMarkdown ? "View raw" : "Render markdown"}
          >
            {renderMarkdown ? <CodeIcon /> : <MarkdownIcon />}
          </button>
        )}
        {content && (
          <button
            type="button"
            className={`file-viewer-action ${copied ? "copied" : ""}`}
            onClick={handleCopy}
            title={copied ? "Copied!" : "Copy content"}
          >
            {copied ? <CheckIcon /> : <CopyIcon />}
          </button>
        )}
        {!standalone && (
          <button
            type="button"
            className="file-viewer-action"
            onClick={handleOpenInNewTab}
            title="Open in new tab"
          >
            <ExternalLinkIcon />
          </button>
        )}
        <button
          type="button"
          className="file-viewer-action"
          onClick={handleDownload}
          title="Download"
        >
          <DownloadIcon />
        </button>
        {onClose && (
          <button
            type="button"
            className="file-viewer-action file-viewer-close"
            onClick={onClose}
            title="Close"
          >
            <CloseIcon />
          </button>
        )}
      </div>
    </div>
  );

  if (standalone) {
    return (
      <div className="file-viewer file-viewer-standalone">
        {header}
        <div className="file-viewer-body">{renderContent()}</div>
      </div>
    );
  }

  return (
    <div className="file-viewer">
      {header}
      <div className="file-viewer-body">{renderContent()}</div>
    </div>
  );
});

// Icons
function CopyIcon() {
  return (
    <svg
      width="16"
      height="16"
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
      width="16"
      height="16"
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

function DownloadIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 2v9M4 8l4 4 4-4M2 14h12" />
    </svg>
  );
}

function ExternalLinkIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 9v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h4M9 2h5v5M6 10l8-8" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M5 4L1 8l4 4M11 4l4 4-4 4" />
    </svg>
  );
}

function MarkdownIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="1" y="3" width="14" height="10" rx="1" />
      <path d="M4 6v4l2-2 2 2V6M10 10V6l2 3 2-3v4" />
    </svg>
  );
}
