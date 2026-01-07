import type { Provider, ProviderCapabilities } from "../types";

export class ClaudeProvider implements Provider {
  readonly id = "claude";
  readonly displayName = "Claude";

  readonly capabilities: ProviderCapabilities = {
    supportsDag: true,
    supportsCloning: true,
  };
}
