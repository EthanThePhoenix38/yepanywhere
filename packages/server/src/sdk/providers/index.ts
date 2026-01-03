/**
 * Provider exports.
 *
 * Re-exports all provider implementations and types.
 */

// Types
export type {
  AgentProvider,
  AgentSession,
  AuthStatus,
  ProviderName,
  StartSessionOptions,
} from "./types.js";

// Claude provider (uses @anthropic-ai/claude-agent-sdk)
export { ClaudeProvider, claudeProvider } from "./claude.js";

// Codex provider (uses codex CLI)
export {
  CodexProvider,
  codexProvider,
  type CodexProviderConfig,
} from "./codex.js";

// Gemini provider (uses gemini CLI)
export {
  GeminiProvider,
  geminiProvider,
  type GeminiProviderConfig,
} from "./gemini.js";

// Local model provider (uses Ollama)
export {
  LocalModelProvider,
  localModelProvider,
  type LocalModelConfig,
} from "./local-model.js";

/**
 * Get all available provider instances.
 * Useful for provider detection UI.
 */
export function getAllProviders(): import("./types.js").AgentProvider[] {
  return [
    require("./claude.js").claudeProvider,
    require("./codex.js").codexProvider,
    require("./gemini.js").geminiProvider,
    require("./local-model.js").localModelProvider,
  ];
}

/**
 * Get a provider by name.
 */
export function getProvider(
  name: import("./types.js").ProviderName,
): import("./types.js").AgentProvider | null {
  switch (name) {
    case "claude":
      return require("./claude.js").claudeProvider;
    case "codex":
      return require("./codex.js").codexProvider;
    case "gemini":
      return require("./gemini.js").geminiProvider;
    case "local":
      return require("./local-model.js").localModelProvider;
    default:
      return null;
  }
}
