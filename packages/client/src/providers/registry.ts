import { ClaudeProvider } from "./implementations/ClaudeProvider";
import {
  CodexOssProvider,
  CodexProvider,
} from "./implementations/CodexProvider";
import { GeminiProvider } from "./implementations/GeminiProvider";
import type { Provider } from "./types";

const providers: Record<string, Provider> = {
  claude: new ClaudeProvider(),
  gemini: new GeminiProvider(),
  codex: new CodexProvider(),
  "codex-oss": new CodexOssProvider(),
};

/**
 * Fallback provider for unknown IDs.
 * Assumes minimal capabilities (no DAG, no cloning).
 */
class GenericProvider implements Provider {
  constructor(readonly id: string) {}

  get displayName(): string {
    return this.id;
  }

  readonly capabilities = {
    supportsDag: false,
    supportsCloning: false,
  };
}

/**
 * Get a provider instance by ID.
 * Returns a generic provider with safe defaults if ID is unknown.
 */
export function getProvider(id: string | undefined): Provider {
  if (!id) {
    return new GenericProvider("unknown");
  }
  return providers[id] ?? new GenericProvider(id);
}
