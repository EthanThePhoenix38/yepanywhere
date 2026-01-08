#!/usr/bin/env tsx

/**
 * Build script for npm package distribution
 *
 * This script prepares a single bundle for npm publishing by:
 * 1. Building the shared package (types)
 * 2. Building the client (React app)
 * 3. Building the server (Node.js app)
 * 4. Copying client dist into server package for embedded serving
 *
 * The resulting server package contains everything needed for distribution.
 */

import { execSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT_DIR = path.resolve(import.meta.dirname, "..");
const CLIENT_DIST = path.join(ROOT_DIR, "packages/client/dist");
const SERVER_PACKAGE = path.join(ROOT_DIR, "packages/server");
const SERVER_CLIENT_DIST = path.join(SERVER_PACKAGE, "client-dist");

interface StepResult {
  step: string;
  success: boolean;
  error?: string;
}

const results: StepResult[] = [];

function log(message: string): void {
  console.log(`[build-bundle] ${message}`);
}

function error(message: string): void {
  console.error(`[build-bundle] ERROR: ${message}`);
}

function execStep(command: string, cwd?: string): void {
  execSync(command, {
    stdio: "inherit",
    cwd: cwd || ROOT_DIR,
  });
}

function step(name: string, fn: () => void): void {
  log(`\n${"=".repeat(60)}`);
  log(`Step: ${name}`);
  log("=".repeat(60));

  try {
    fn();
    results.push({ step: name, success: true });
    log(`✓ ${name} completed`);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    results.push({ step: name, success: false, error: errorMsg });
    error(`✗ ${name} failed: ${errorMsg}`);
    throw err;
  }
}

// Clean previous build artifacts
step("Clean previous builds", () => {
  log("Removing old dist directories...");

  const dirsToClean = [
    path.join(ROOT_DIR, "packages/shared/dist"),
    path.join(ROOT_DIR, "packages/client/dist"),
    path.join(ROOT_DIR, "packages/server/dist"),
    SERVER_CLIENT_DIST,
  ];

  for (const dir of dirsToClean) {
    if (fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
      log(`  Removed: ${path.relative(ROOT_DIR, dir)}`);
    }
  }

  // Clean bundled directory
  const bundledDir = path.join(SERVER_PACKAGE, "bundled");
  if (fs.existsSync(bundledDir)) {
    fs.rmSync(bundledDir, { recursive: true, force: true });
    log(`  Removed: ${path.relative(ROOT_DIR, bundledDir)}`);
  }
});

// Build shared package (types/schemas)
step("Build shared package", () => {
  log("Building @yep-anywhere/shared (TypeScript compilation)...");
  execStep("pnpm --filter @yep-anywhere/shared build");
});

// Build client
step("Build client", () => {
  log("Building @yep-anywhere/client (Vite production build)...");
  execStep("pnpm --filter @yep-anywhere/client build");

  // Verify client dist exists
  if (!fs.existsSync(CLIENT_DIST)) {
    throw new Error(
      `Client dist not found at ${CLIENT_DIST} after build. Vite build may have failed.`,
    );
  }

  const indexHtml = path.join(CLIENT_DIST, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      "Client dist exists but index.html not found. Incomplete build?",
    );
  }

  log(`  Client built successfully: ${path.relative(ROOT_DIR, CLIENT_DIST)}`);
});

// Build server
step("Build server", () => {
  log("Building @yep-anywhere/server (TypeScript compilation)...");
  execStep("pnpm --filter @yep-anywhere/server build");

  // Verify server dist exists
  const serverDist = path.join(SERVER_PACKAGE, "dist");
  if (!fs.existsSync(serverDist)) {
    throw new Error(
      `Server dist not found at ${serverDist} after build. TypeScript compilation may have failed.`,
    );
  }

  log(`  Server built successfully: ${path.relative(ROOT_DIR, serverDist)}`);
});

// Copy shared dist into server package (for @yep-anywhere/shared imports)
// We put it in 'bundled/' instead of 'node_modules/' because npm ignores node_modules
step("Bundle shared into server package", () => {
  const SHARED_DIST = path.join(ROOT_DIR, "packages/shared/dist");
  const BUNDLED_SHARED_PATH = path.join(
    SERVER_PACKAGE,
    "bundled/@yep-anywhere/shared",
  );
  const BUNDLED_SHARED_DIST = path.join(BUNDLED_SHARED_PATH, "dist");

  log(
    `Copying shared dist to ${path.relative(ROOT_DIR, BUNDLED_SHARED_DIST)}...`,
  );

  // Remove existing directory
  if (fs.existsSync(BUNDLED_SHARED_PATH)) {
    fs.rmSync(BUNDLED_SHARED_PATH, { recursive: true, force: true });
  }

  // Create directory structure
  fs.mkdirSync(BUNDLED_SHARED_DIST, { recursive: true });

  // Copy shared dist files
  copyRecursive(SHARED_DIST, BUNDLED_SHARED_DIST);

  // Create a minimal package.json for the shared package
  const sharedPackageJson = {
    name: "@yep-anywhere/shared",
    version: "0.1.0",
    type: "module",
    main: "dist/index.js",
    types: "dist/index.d.ts",
  };
  fs.writeFileSync(
    path.join(BUNDLED_SHARED_PATH, "package.json"),
    JSON.stringify(sharedPackageJson, null, 2),
  );

  log("  Shared types and runtime bundled into server package");
});

// Copy client dist into server package
step("Bundle client into server package", () => {
  log(
    `Copying client dist to ${path.relative(ROOT_DIR, SERVER_CLIENT_DIST)}...`,
  );

  // Create server client-dist directory
  fs.mkdirSync(SERVER_CLIENT_DIST, { recursive: true });

  // Copy all client dist files
  copyRecursive(CLIENT_DIST, SERVER_CLIENT_DIST);

  // Verify critical files were copied
  const copiedIndexHtml = path.join(SERVER_CLIENT_DIST, "index.html");
  if (!fs.existsSync(copiedIndexHtml)) {
    throw new Error("Failed to copy client dist: index.html not found");
  }

  log("  Client assets bundled into server package");
  log(`  Location: ${path.relative(ROOT_DIR, SERVER_CLIENT_DIST)}`);
});

// Prepare package.json for publishing
step("Prepare package.json for npm", () => {
  log("Updating package.json for npm publishing...");

  const packageJsonPath = path.join(SERVER_PACKAGE, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf-8"));

  // Update fields for publishing
  packageJson.name = "yepanywhere";
  packageJson.version = "0.1.0";
  packageJson.description = "A mobile-first supervisor for Claude Code agents";
  packageJson.private = undefined;
  packageJson.devDependencies = undefined; // Not needed in published package

  // Add CLI binary entry point
  packageJson.bin = {
    yepanywhere: "./dist/cli.js",
  };

  // Add module exports
  packageJson.main = "./dist/index.js";
  packageJson.exports = {
    ".": "./dist/index.js",
  };

  // Specify files to include in npm package
  packageJson.files = ["dist", "client-dist", "bundled", "scripts"];

  // Add postinstall script to link bundled shared package
  packageJson.scripts = {
    postinstall: "node scripts/postinstall.js",
  };

  // Remove the workspace dependency - it's bundled and linked by postinstall
  packageJson.dependencies["@yep-anywhere/shared"] = undefined;

  // Add repository and other metadata
  packageJson.repository = {
    type: "git",
    url: "https://github.com/kgraehl/yepanywhere.git",
  };
  packageJson.keywords = ["claude", "ai", "agent", "supervisor", "mobile"];
  packageJson.license = "MIT";
  packageJson.engines = {
    node: ">=20",
  };

  // Write back
  fs.writeFileSync(
    packageJsonPath,
    `${JSON.stringify(packageJson, null, 2)}\n`,
  );

  log("  Package name: yepanywhere");
  log("  Version: 0.1.0");
  log("  Removed: private flag, devDependencies, workspace dependency");
  log("  Added: bin, main, exports, files (with bundled shared), metadata");
});

// Helper: Recursive copy
function copyRecursive(src: string, dest: string): void {
  const stats = fs.statSync(src);

  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const file of fs.readdirSync(src)) {
      copyRecursive(path.join(src, file), path.join(dest, file));
    }
  } else {
    fs.copyFileSync(src, dest);
  }
}

// Print summary
log(`\n${"=".repeat(60)}`);
log("Build Summary");
log("=".repeat(60));

for (const result of results) {
  const status = result.success ? "✓" : "✗";
  log(`${status} ${result.step}`);
  if (result.error) {
    log(`  Error: ${result.error}`);
  }
}

const allSuccess = results.every((r) => r.success);
if (allSuccess) {
  log("\n✓ All build steps completed successfully!");
  log("\nThe server package is ready for publishing:");
  log(`  Location: ${path.relative(ROOT_DIR, SERVER_PACKAGE)}`);
  log(`  Client assets: ${path.relative(ROOT_DIR, SERVER_CLIENT_DIST)}`);
  log("\nNext steps:");
  log("  1. Test: npm pack (from packages/server)");
  log("  2. Publish: npm publish (from packages/server)");
} else {
  error("\n✗ Build failed. See errors above.");
  process.exit(1);
}
