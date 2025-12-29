import { memo } from "react";
import Markdown from "react-markdown";

interface Props {
  text: string;
}

export const TextBlock = memo(function TextBlock({ text }: Props) {
  return (
    <div className="text-block">
      <Markdown>{text}</Markdown>
    </div>
  );
});
