import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { ContentBlock, ContentRenderer, RenderContext } from "../types";

interface TextBlock extends ContentBlock {
  type: "text";
  text: string;
}

/**
 * Text renderer - displays text content with markdown rendering
 */
function TextRendererComponent({ block }: { block: TextBlock }) {
  return (
    <div className="text-block">
      <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
    </div>
  );
}

export const textRenderer: ContentRenderer<TextBlock> = {
  type: "text",
  render(block, _context) {
    return <TextRendererComponent block={block as TextBlock} />;
  },
  getSummary(block) {
    const text = (block as TextBlock).text;
    return text.length > 100 ? `${text.slice(0, 97)}...` : text;
  },
};
