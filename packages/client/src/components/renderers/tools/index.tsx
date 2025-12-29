import type { ReactNode } from "react";
import type { RenderContext } from "../types";
import type { ToolRenderer } from "./types";

/**
 * Registry for tool-specific renderers
 */
class ToolRendererRegistry {
  private tools = new Map<string, ToolRenderer>();
  private fallback: ToolRenderer;

  constructor(fallback: ToolRenderer) {
    this.fallback = fallback;
  }

  register(renderer: ToolRenderer): void {
    this.tools.set(renderer.tool, renderer);
  }

  get(toolName: string): ToolRenderer {
    return this.tools.get(toolName) || this.fallback;
  }

  renderToolUse(
    toolName: string,
    input: unknown,
    context: RenderContext,
  ): ReactNode {
    return this.get(toolName).renderToolUse(input, context);
  }

  renderToolResult(
    toolName: string,
    result: unknown,
    isError: boolean,
    context: RenderContext,
  ): ReactNode {
    return this.get(toolName).renderToolResult(result, isError, context);
  }
}

/**
 * Fallback tool renderer - shows raw JSON
 */
const fallbackToolRenderer: ToolRenderer = {
  tool: "__fallback__",
  renderToolUse(input, _context) {
    return (
      <pre className="tool-fallback">
        <code>{JSON.stringify(input, null, 2)}</code>
      </pre>
    );
  },
  renderToolResult(result, isError, _context) {
    return (
      <pre className={`tool-fallback ${isError ? "tool-fallback-error" : ""}`}>
        <code>{JSON.stringify(result, null, 2)}</code>
      </pre>
    );
  },
};

// Create and export the tool registry
export const toolRegistry = new ToolRendererRegistry(fallbackToolRenderer);

// Import and register tool renderers
import { bashRenderer } from "./BashRenderer";
import { editRenderer } from "./EditRenderer";
import { globRenderer } from "./GlobRenderer";
import { grepRenderer } from "./GrepRenderer";
import { readRenderer } from "./ReadRenderer";
import { todoWriteRenderer } from "./TodoWriteRenderer";
import { writeRenderer } from "./WriteRenderer";

toolRegistry.register(bashRenderer);
toolRegistry.register(readRenderer);
toolRegistry.register(editRenderer);
toolRegistry.register(writeRenderer);
toolRegistry.register(globRenderer);
toolRegistry.register(grepRenderer);
toolRegistry.register(todoWriteRenderer);
