import { access, readdir, stat } from "node:fs/promises";
import { basename, join, sep } from "node:path";
import {
  DEFAULT_PROVIDER,
  type ProviderName,
  type UrlProjectId,
} from "@yep-anywhere/shared";
import type { ProjectMetadataService } from "../metadata/index.js";
import type { Project } from "../supervisor/types.js";
import { CODEX_SESSIONS_DIR, CodexSessionScanner } from "./codex-scanner.js";
import { GEMINI_TMP_DIR, GeminiSessionScanner } from "./gemini-scanner.js";
import {
  CLAUDE_PROJECTS_DIR,
  decodeProjectId,
  encodeProjectId,
  isAbsolutePath,
  readCwdFromSessionFile,
} from "./paths.js";

export interface ScannerOptions {
  projectsDir?: string; // override for testing
  codexSessionsDir?: string; // override for testing
  geminiSessionsDir?: string; // override for testing
  enableCodex?: boolean; // whether to include Codex projects (default: true)
  enableGemini?: boolean; // whether to include Gemini projects (default: true)
  projectMetadataService?: ProjectMetadataService; // for persisting added projects
}

export class ProjectScanner {
  private projectsDir: string;
  private codexScanner: CodexSessionScanner | null;
  private geminiScanner: GeminiSessionScanner | null;
  private enableCodex: boolean;
  private enableGemini: boolean;
  private projectMetadataService: ProjectMetadataService | null;

  constructor(options: ScannerOptions = {}) {
    this.projectsDir = options.projectsDir ?? CLAUDE_PROJECTS_DIR;
    this.enableCodex = options.enableCodex ?? true;
    this.enableGemini = options.enableGemini ?? true;
    this.codexScanner = this.enableCodex
      ? new CodexSessionScanner({
          sessionsDir: options.codexSessionsDir ?? CODEX_SESSIONS_DIR,
        })
      : null;
    this.geminiScanner = this.enableGemini
      ? new GeminiSessionScanner({
          sessionsDir: options.geminiSessionsDir ?? GEMINI_TMP_DIR,
        })
      : null;
    this.projectMetadataService = options.projectMetadataService ?? null;
  }

  /**
   * Set the project metadata service (for late initialization).
   */
  setProjectMetadataService(service: ProjectMetadataService): void {
    this.projectMetadataService = service;
  }

  async listProjects(): Promise<Project[]> {
    const projects: Project[] = [];
    const seenPaths = new Set<string>();

    try {
      await access(this.projectsDir);
    } catch {
      // Directory doesn't exist - return empty list
      return [];
    }

    // ~/.claude/projects/ can have two structures:
    // 1. Projects directly as -home-user-project/
    // 2. Projects under hostname/ as hostname/-home-user-project/
    let dirs: string[];
    try {
      const entries = await readdir(this.projectsDir, { withFileTypes: true });
      dirs = entries.filter((e) => e.isDirectory()).map((e) => e.name);
    } catch {
      return [];
    }

    for (const dir of dirs) {
      const dirPath = join(this.projectsDir, dir);

      // Check if this is a project directory (starts with -)
      if (dir.startsWith("-")) {
        const projectPath = await this.getProjectPathFromSessions(dirPath);
        if (projectPath && !seenPaths.has(projectPath)) {
          seenPaths.add(projectPath);
          const sessionCount = await this.countSessions(dirPath);
          const lastActivity = await this.getLastActivity(dirPath);
          projects.push({
            id: encodeProjectId(projectPath),
            path: projectPath,
            name: basename(projectPath),
            sessionCount,
            sessionDir: dirPath,
            activeOwnedCount: 0, // populated by route
            activeExternalCount: 0, // populated by route
            lastActivity,
            provider: "claude",
          });
        }
        continue;
      }

      // Otherwise, treat as hostname directory
      // Format: ~/.claude/projects/hostname/-project-path/
      let projectDirs: string[];
      try {
        const subEntries = await readdir(dirPath, { withFileTypes: true });
        projectDirs = subEntries
          .filter((e) => e.isDirectory())
          .map((e) => e.name);
      } catch {
        continue;
      }

      for (const projectDir of projectDirs) {
        const projectDirPath = join(dirPath, projectDir);
        const projectPath =
          await this.getProjectPathFromSessions(projectDirPath);

        if (!projectPath || seenPaths.has(projectPath)) continue;
        seenPaths.add(projectPath);

        const sessionCount = await this.countSessions(projectDirPath);
        const lastActivity = await this.getLastActivity(projectDirPath);

        projects.push({
          id: encodeProjectId(projectPath),
          path: projectPath,
          name: basename(projectPath),
          sessionCount,
          sessionDir: projectDirPath,
          activeOwnedCount: 0, // populated by route
          activeExternalCount: 0, // populated by route
          lastActivity,
          provider: "claude",
        });
      }
    }

    // Merge Codex projects if enabled
    if (this.codexScanner) {
      const codexProjects = await this.codexScanner.listProjects();
      for (const codexProject of codexProjects) {
        // Skip if we've already seen this path from Claude
        if (seenPaths.has(codexProject.path)) continue;
        seenPaths.add(codexProject.path);
        projects.push(codexProject);
      }
    }

    // Merge Gemini projects if enabled
    if (this.geminiScanner) {
      // Register known paths for hash resolution before scanning
      this.geminiScanner.registerKnownPaths(Array.from(seenPaths));

      const geminiProjects = await this.geminiScanner.listProjects();
      for (const geminiProject of geminiProjects) {
        // Skip if we've already seen this path from Claude/Codex
        // (Gemini projects with unknown hashes will have paths like "gemini:xxxxxxxx")
        if (seenPaths.has(geminiProject.path)) continue;
        seenPaths.add(geminiProject.path);
        projects.push(geminiProject);
      }
    }

    // Merge manually added projects (from ProjectMetadataService)
    if (this.projectMetadataService) {
      const addedProjects = this.projectMetadataService.getAllProjects();
      for (const [projectId, metadata] of Object.entries(addedProjects)) {
        // Skip if we've already seen this path from another source
        if (seenPaths.has(metadata.path)) continue;

        // Verify the directory still exists
        try {
          const stats = await stat(metadata.path);
          if (!stats.isDirectory()) continue;
        } catch {
          // Directory no longer exists, skip it
          continue;
        }

        seenPaths.add(metadata.path);
        const encodedPath = metadata.path.replace(/[/\\:]/g, "-");
        projects.push({
          id: projectId as UrlProjectId,
          path: metadata.path,
          name: basename(metadata.path),
          sessionCount: 0,
          sessionDir: join(this.projectsDir, encodedPath),
          activeOwnedCount: 0,
          activeExternalCount: 0,
          lastActivity: metadata.addedAt,
          provider: "claude",
        });
      }
    }

    return projects;
  }

  async getProject(projectId: string): Promise<Project | null> {
    const projects = await this.listProjects();
    return projects.find((p) => p.id === projectId) ?? null;
  }

  /**
   * Get a project by ID, or create a virtual project entry if the path exists on disk
   * but hasn't been used with Claude yet.
   *
   * This allows starting sessions in new directories without requiring prior Claude usage.
   */
  async getOrCreateProject(
    projectId: string,
    preferredProvider?: "claude" | "codex" | "gemini",
  ): Promise<Project | null> {
    // First check if project already exists
    const existing = await this.getProject(projectId);
    if (existing) return existing;

    // Decode the projectId to get the path
    let projectPath: string;
    try {
      projectPath = decodeProjectId(projectId as UrlProjectId);
    } catch {
      return null;
    }

    // Validate path is absolute
    if (!isAbsolutePath(projectPath)) {
      return null;
    }

    // Check if the directory exists on disk
    try {
      const stats = await stat(projectPath);
      if (!stats.isDirectory()) {
        return null;
      }
    } catch {
      return null;
    }

    // Determine provider: use preferred if specified, otherwise check for Codex/Gemini sessions
    let provider: ProviderName = preferredProvider ?? DEFAULT_PROVIDER;
    if (!preferredProvider) {
      // Check if Codex sessions exist for this path
      if (this.codexScanner) {
        const codexSessions =
          await this.codexScanner.getSessionsForProject(projectPath);
        if (codexSessions.length > 0) {
          provider = "codex";
        }
      }

      // Check if Gemini sessions exist for this path (only if no Codex sessions)
      if (provider === "claude" && this.geminiScanner) {
        const geminiSessions =
          await this.geminiScanner.getSessionsForProject(projectPath);
        if (geminiSessions.length > 0) {
          provider = "gemini";
        }
      }
    }

    // Create a virtual project entry
    // The session directory will be created by the SDK when the first session starts
    const encodedPath = projectPath.replace(/[/\\:]/g, "-");

    // Determine the session directory based on provider
    let sessionDir: string;
    if (provider === "codex") {
      sessionDir = CODEX_SESSIONS_DIR;
    } else if (provider === "gemini") {
      sessionDir = GEMINI_TMP_DIR;
    } else {
      sessionDir = join(this.projectsDir, encodedPath);
    }

    return {
      id: projectId as UrlProjectId,
      path: projectPath,
      name: basename(projectPath),
      sessionCount: 0,
      sessionDir,
      activeOwnedCount: 0,
      activeExternalCount: 0,
      lastActivity: null,
      provider,
    };
  }

  /**
   * Find a project by matching the session directory suffix.
   *
   * This is used by ExternalSessionTracker which extracts the directory-based
   * project identifier from file paths (e.g., "-home-user-project" or
   * "hostname/-home-user-project") rather than the base64url-encoded projectId.
   */
  async getProjectBySessionDirSuffix(
    dirSuffix: string,
  ): Promise<Project | null> {
    const projects = await this.listProjects();
    // Match projects where sessionDir ends with the suffix pattern
    // e.g., suffix "-home-user-project" matches "~/.claude/projects/-home-user-project"
    // e.g., suffix "hostname/-home-user-project" matches "~/.claude/projects/hostname/-home-user-project"
    return (
      projects.find((p) => p.sessionDir.endsWith(`${sep}${dirSuffix}`)) ?? null
    );
  }

  /**
   * Get the actual project path by reading the cwd from a session file.
   *
   * NOTE: This is necessary because the directory names use a lossy
   * slash-to-hyphen encoding that cannot be reversed reliably.
   * See packages/server/src/projects/paths.ts for full documentation.
   */
  private async getProjectPathFromSessions(
    projectDirPath: string,
  ): Promise<string | null> {
    try {
      const files = await readdir(projectDirPath);
      const jsonlFiles = files.filter((f) => f.endsWith(".jsonl"));

      if (jsonlFiles.length === 0) {
        return null;
      }

      // Try to read cwd from the first available session file
      for (const file of jsonlFiles) {
        const filePath = join(projectDirPath, file);
        const cwd = await readCwdFromSessionFile(filePath);
        if (cwd) {
          return cwd;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  private async countSessions(projectDirPath: string): Promise<number> {
    try {
      const files = await readdir(projectDirPath);
      // Count .jsonl files, excluding agent-* (internal subagent warmup sessions)
      return files.filter(
        (f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
      ).length;
    } catch {
      return 0;
    }
  }

  private async getLastActivity(
    projectDirPath: string,
  ): Promise<string | null> {
    try {
      const files = await readdir(projectDirPath);
      const jsonlFiles = files.filter(
        (f) => f.endsWith(".jsonl") && !f.startsWith("agent-"),
      );

      if (jsonlFiles.length === 0) return null;

      let latestMtime = 0;
      for (const file of jsonlFiles) {
        const stats = await stat(join(projectDirPath, file));
        if (stats.mtimeMs > latestMtime) {
          latestMtime = stats.mtimeMs;
        }
      }

      return latestMtime > 0 ? new Date(latestMtime).toISOString() : null;
    } catch {
      return null;
    }
  }
}

// Singleton for convenience
export const projectScanner = new ProjectScanner();
