import { memo, useState } from "react";
import {
  type UploadedFileInfo,
  getFilename,
  parseUserPrompt,
} from "../../lib/parseUserPrompt";
import type { ContentBlock } from "../../types";
import { Modal } from "../ui/Modal";

const MAX_LINES = 12;
const MAX_CHARS = MAX_LINES * 100;

interface Props {
  content: string | ContentBlock[];
}

/**
 * Renders file metadata (opened files) below the user prompt
 */
function OpenedFilesMetadata({ files }: { files: string[] }) {
  if (files.length === 0) return null;

  return (
    <div className="user-prompt-metadata">
      {files.map((filePath) => (
        <span
          key={filePath}
          className="opened-file"
          title={`file was opened in editor: ${filePath}`}
        >
          {getFilename(filePath)}
        </span>
      ))}
    </div>
  );
}

/**
 * Check if a MIME type is an image type
 */
function isImageMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/");
}

/**
 * Extract URL components from an uploaded file path.
 * Path format: /.../.yep-anywhere/uploads/{projectId}/{sessionId}/{filename}
 */
function getUploadUrl(filePath: string): string | null {
  // Split path and get last 3 components: projectId, sessionId, filename
  const parts = filePath.split("/");
  if (parts.length < 3) return null;

  const filename = parts[parts.length - 1];
  const sessionId = parts[parts.length - 2];
  const projectId = parts[parts.length - 3];

  if (!filename || !sessionId || !projectId) return null;

  // Validate filename has UUID prefix
  if (!/^[0-9a-f-]{36}_/.test(filename)) return null;

  return `/api/projects/${projectId}/sessions/${sessionId}/upload/${encodeURIComponent(filename)}`;
}

/**
 * Single uploaded file attachment - clickable for images
 */
function UploadedFileItem({ file }: { file: UploadedFileInfo }) {
  const [showModal, setShowModal] = useState(false);
  const isImage = isImageMimeType(file.mimeType);
  const uploadUrl = isImage ? getUploadUrl(file.path) : null;

  if (isImage && uploadUrl) {
    return (
      <>
        <button
          type="button"
          className="uploaded-file uploaded-file-clickable"
          title={`${file.mimeType}, ${file.size}`}
          onClick={() => setShowModal(true)}
        >
          📎 {file.originalName}
        </button>
        {showModal && (
          <Modal title={file.originalName} onClose={() => setShowModal(false)}>
            <div className="uploaded-image-modal">
              <img src={uploadUrl} alt={file.originalName} />
            </div>
          </Modal>
        )}
      </>
    );
  }

  return (
    <span className="uploaded-file" title={`${file.mimeType}, ${file.size}`}>
      📎 {file.originalName}
    </span>
  );
}

/**
 * Renders uploaded file attachments below the user prompt
 */
function UploadedFilesMetadata({ files }: { files: UploadedFileInfo[] }) {
  if (files.length === 0) return null;

  return (
    <div className="user-prompt-metadata">
      {files.map((file) => (
        <UploadedFileItem key={file.path} file={file} />
      ))}
    </div>
  );
}

/**
 * Renders text content with optional truncation and "Show more" button
 */
function CollapsibleText({ text }: { text: string }) {
  const [isExpanded, setIsExpanded] = useState(false);
  const lines = text.split("\n");
  const exceedsLines = lines.length > MAX_LINES;
  const exceedsChars = text.length > MAX_CHARS;
  const needsTruncation = exceedsLines || exceedsChars;

  if (!needsTruncation || isExpanded) {
    return (
      <div className="text-block">
        {text}
        {isExpanded && needsTruncation && (
          <button
            type="button"
            className="show-more-btn"
            onClick={() => setIsExpanded(false)}
          >
            Show less
          </button>
        )}
      </div>
    );
  }

  // Truncate by lines first, then by characters if still too long
  let truncatedText = exceedsLines
    ? lines.slice(0, MAX_LINES).join("\n")
    : text;
  if (truncatedText.length > MAX_CHARS) {
    truncatedText = truncatedText.slice(0, MAX_CHARS);
  }

  return (
    <div className="text-block collapsible-text">
      <div className="truncated-content">
        {truncatedText}
        <div className="fade-overlay" />
      </div>
      <button
        type="button"
        className="show-more-btn"
        onClick={() => setIsExpanded(true)}
      >
        Show more
      </button>
    </div>
  );
}

export const UserPromptBlock = memo(function UserPromptBlock({
  content,
}: Props) {
  if (typeof content === "string") {
    const { text, openedFiles, uploadedFiles } = parseUserPrompt(content);

    // Don't render if there's no actual text content
    if (!text) {
      const hasMetadata = openedFiles.length > 0 || uploadedFiles.length > 0;
      return hasMetadata ? (
        <>
          <UploadedFilesMetadata files={uploadedFiles} />
          <OpenedFilesMetadata files={openedFiles} />
        </>
      ) : null;
    }

    return (
      <div className="user-prompt-container">
        <div className="message message-user-prompt">
          <div className="message-content">
            <CollapsibleText text={text} />
            <UploadedFilesMetadata files={uploadedFiles} />
          </div>
        </div>
        <OpenedFilesMetadata files={openedFiles} />
      </div>
    );
  }

  // Array content - extract text blocks for display
  const textContent = content
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text)
    .join("\n");

  // Parse the combined text content for metadata
  const { text, openedFiles, uploadedFiles } = parseUserPrompt(textContent);

  if (!text) {
    const hasMetadata = openedFiles.length > 0 || uploadedFiles.length > 0;
    return hasMetadata ? (
      <>
        <UploadedFilesMetadata files={uploadedFiles} />
        <OpenedFilesMetadata files={openedFiles} />
      </>
    ) : (
      <div className="message message-user-prompt">
        <div className="message-content">
          <div className="text-block">[Complex content]</div>
        </div>
      </div>
    );
  }

  return (
    <div className="user-prompt-container">
      <div className="message message-user-prompt">
        <div className="message-content">
          <CollapsibleText text={text} />
          <UploadedFilesMetadata files={uploadedFiles} />
        </div>
      </div>
      <OpenedFilesMetadata files={openedFiles} />
    </div>
  );
});
