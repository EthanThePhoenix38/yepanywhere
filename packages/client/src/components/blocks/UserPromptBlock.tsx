import { memo, useState } from "react";
import {
  type UploadedFileInfo,
  getFilename,
  parseUserPrompt,
} from "../../lib/parseUserPrompt";
import type { ContentBlock } from "../../types";

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
 * Renders uploaded file attachments below the user prompt
 */
function UploadedFilesMetadata({ files }: { files: UploadedFileInfo[] }) {
  if (files.length === 0) return null;

  return (
    <div className="user-prompt-metadata">
      {files.map((file) => (
        <span
          key={file.path}
          className="uploaded-file"
          title={`${file.mimeType}, ${file.size}`}
        >
          📎 {file.originalName}
        </span>
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
