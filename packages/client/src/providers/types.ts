/**
 * Capability flags for providers.
 * Extend this interface as we discover more provider-specific behaviors.
 */
export interface ProviderCapabilities {
  /**
   * Whether the provider supports DAG-based message history.
   * If true, client will reorder messages based on parentUuid.
   * If false, client will respect server-sent order (linear).
   */
  supportsDag: boolean;

  /**
   * Whether the provider supports cloning sessions.
   */
  supportsCloning: boolean;
}

/**
 * Client-side abstraction for an AI provider.
 * Encapsulates capabilities and metadata to avoid scattered "if/else" checks.
 */
export interface Provider {
  /** Internal ID (e.g. 'claude', 'gemini') */
  readonly id: string;

  /** Human-readable name */
  readonly displayName: string;

  /** Capability flags */
  readonly capabilities: ProviderCapabilities;
}
