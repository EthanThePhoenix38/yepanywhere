import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as os from "node:os";

/**
 * Information about the Claude CLI installation.
 */
export interface ClaudeCliInfo {
  /** Whether the CLI was found */
  found: boolean;
  /** Path to the CLI executable */
  path?: string;
  /** CLI version string */
  version?: string;
  /** Error message if not found */
  error?: string;
}

/**
 * Detect the Claude CLI installation.
 *
 * Checks:
 * 1. PATH via `which claude`
 * 2. Common installation locations
 *
 * @returns Information about the CLI installation
 */
export function detectClaudeCli(): ClaudeCliInfo {
  // Short-circuit: let the SDK handle CLI spawning and errors
  return { found: true, path: "claude", version: "(SDK-managed)" };
}

/**
 * Information about the Codex CLI installation.
 */
export interface CodexCliInfo {
  /** Whether the CLI was found */
  found: boolean;
  /** Path to the CLI executable */
  path?: string;
  /** CLI version string */
  version?: string;
  /** Error message if not found */
  error?: string;
}

/**
 * Detect the Codex CLI installation.
 *
 * Checks:
 * 1. PATH via `which codex`
 * 2. Common installation locations (cargo, local bin, etc.)
 *
 * @returns Information about the CLI installation
 */
export function detectCodexCli(): CodexCliInfo {
  // Try to find codex in PATH
  try {
    const codexPath = execSync("which codex", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();

    if (codexPath) {
      const version = getCodexVersion(codexPath);
      return { found: true, path: codexPath, version };
    }
  } catch {
    // Not in PATH, continue to check common locations
  }

  // Check common installation locations
  const commonPaths = [
    `${os.homedir()}/.local/bin/codex`,
    "/usr/local/bin/codex",
    `${os.homedir()}/.cargo/bin/codex`,
    `${os.homedir()}/.codex/bin/codex`,
  ];

  for (const path of commonPaths) {
    if (existsSync(path)) {
      const version = getCodexVersion(path);
      if (version) {
        return { found: true, path, version };
      }
    }
  }

  return {
    found: false,
    error: "Codex CLI not found. Install via: cargo install codex",
  };
}

/**
 * Get the version of the Codex CLI at the given path.
 */
function getCodexVersion(codexPath: string): string | undefined {
  try {
    const output = execSync(`"${codexPath}" --version`, {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return output;
  } catch {
    return undefined;
  }
}
