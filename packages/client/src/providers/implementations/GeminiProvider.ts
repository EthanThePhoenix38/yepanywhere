import type { Provider, ProviderCapabilities } from "../types";

export class GeminiProvider implements Provider {
  readonly id = "gemini";
  readonly displayName = "Gemini";

  readonly capabilities: ProviderCapabilities = {
    supportsDag: false,
    supportsCloning: false,
  };
}
