import type { CodexSessionScanner } from "../projects/codex-scanner.js";
import type { GeminiSessionScanner } from "../projects/gemini-scanner.js";

export interface ProviderCatalogDeps {
  codexScanner?: CodexSessionScanner;
  geminiScanner?: GeminiSessionScanner;
}

export interface ProviderProjectCatalog {
  codexPaths: Set<string>;
  geminiPaths: Set<string>;
  geminiHashToCwd?: Promise<Map<string, string>>;
}

/**
 * Build a per-request catalog of project paths that have Codex/Gemini sessions.
 * This avoids re-running scanner filters for each project in route loops.
 */
export async function buildProviderProjectCatalog(
  deps: ProviderCatalogDeps,
): Promise<ProviderProjectCatalog> {
  const [codexProjects, geminiProjects] = await Promise.all([
    deps.codexScanner?.listProjects() ?? Promise.resolve([]),
    deps.geminiScanner?.listProjects() ?? Promise.resolve([]),
  ]);

  return {
    codexPaths: new Set(codexProjects.map((project) => project.path)),
    geminiPaths: new Set(
      geminiProjects
        .map((project) => project.path)
        .filter((path) => !path.startsWith("gemini:")),
    ),
    geminiHashToCwd: deps.geminiScanner?.getHashToCwd(),
  };
}
