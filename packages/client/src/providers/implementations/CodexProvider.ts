import type { Provider, ProviderCapabilities } from "../types";

export class CodexProvider implements Provider {
  readonly id = "codex";
  readonly displayName = "Codex";

  readonly capabilities: ProviderCapabilities = {
    supportsDag: false, // Linear history
    supportsCloning: false,
  };
}

export class CodexOssProvider implements Provider {
  readonly id = "codex-oss";
  readonly displayName = "Codex OSS";

  readonly capabilities: ProviderCapabilities = {
    supportsDag: false, // Linear history
    supportsCloning: false,
  };
}
