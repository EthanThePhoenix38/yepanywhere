#!/usr/bin/env node

/**
 * CLI entry point for yepanywhere
 *
 * Usage:
 *   yepanywhere                    # Start server with defaults
 *   yepanywhere --help            # Show help
 *   yepanywhere --version         # Show version
 *
 * Environment variables:
 *   PORT                          # Server port (default: 3400)
 *   YEP_ANYWHERE_DATA_DIR         # Data directory override
 *   YEP_ANYWHERE_PROFILE          # Profile name (creates ~/.yep-anywhere-{profile}/)
 *   AUTH_ENABLED                  # Enable cookie auth (default: false)
 *   LOG_LEVEL                     # Log level: fatal, error, warn, info, debug, trace
 *   ... (see CLAUDE.md for full list)
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function showHelp(): void {
  console.log(`
yepanywhere - A mobile-first supervisor for Claude Code agents

USAGE:
  yepanywhere [OPTIONS]

OPTIONS:
  --help, -h        Show this help message
  --version, -v     Show version number

ENVIRONMENT VARIABLES:
  PORT                          Server port (default: 3400)
  YEP_ANYWHERE_DATA_DIR         Data directory override
  YEP_ANYWHERE_PROFILE          Profile name (creates ~/.yep-anywhere-{profile}/)
  AUTH_ENABLED                  Enable cookie auth (default: false)
  LOG_LEVEL                     Log level: fatal, error, warn, info, debug, trace
  MAINTENANCE_PORT              Maintenance server port (default: PORT + 1, 0 to disable)

EXAMPLES:
  # Start with defaults (port 3400)
  yepanywhere

  # Start on custom port
  PORT=8000 yepanywhere

  # Use development profile (separate data directory)
  YEP_ANYWHERE_PROFILE=dev yepanywhere

  # Enable authentication
  AUTH_ENABLED=true yepanywhere

DOCUMENTATION:
  For full documentation, see: https://github.com/your-org/yepanywhere

DATA DIRECTORY:
  Default: ~/.yep-anywhere/
  Contains: logs/, indexes/, uploads/, session metadata, push subscriptions

REQUIREMENTS:
  - Node.js >= 20
  - Claude CLI installed (curl -fsSL https://claude.ai/install.sh | bash)
`);
}

function getVersion(): string {
  try {
    // Read package.json from the package root
    const packageJsonPath = path.resolve(__dirname, "../package.json");
    const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));
    return packageJson.version || "unknown";
  } catch (error) {
    return "unknown";
  }
}

function showVersion(): void {
  console.log(`yepanywhere v${getVersion()}`);
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.includes("--help") || args.includes("-h")) {
  showHelp();
  process.exit(0);
}

if (args.includes("--version") || args.includes("-v")) {
  showVersion();
  process.exit(0);
}

// If there are unknown arguments, show error and help
if (args.length > 0) {
  console.error(`Error: Unknown arguments: ${args.join(" ")}`);
  console.error("");
  console.error("Run 'yepanywhere --help' for usage information.");
  process.exit(1);
}

// Set NODE_ENV to production if not already set (CLI users expect production mode)
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "production";
}

// Start the server by importing the main module
// This ensures all initialization happens in index.ts as designed
async function start() {
  try {
    await import("./index.js");
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
}

start();
