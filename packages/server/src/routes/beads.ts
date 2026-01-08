import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { UrlProjectId } from "@yep-anywhere/shared";
import { Hono } from "hono";
import type { ProjectScanner } from "../projects/scanner.js";

const execFileAsync = promisify(execFile);

/**
 * Beads issue from bd list --json output
 */
export interface BeadsIssue {
  id: string;
  title: string;
  description: string;
  status: string;
  priority: number;
  issue_type: string;
  created_at: string;
  created_by: string;
  updated_at: string;
  dependency_count?: number;
  dependent_count?: number;
}

/**
 * Beads status info
 */
export interface BeadsStatus {
  installed: boolean;
  initialized: boolean;
  totalIssues?: number;
  openCount?: number;
  closedCount?: number;
  readyCount?: number;
}

/**
 * Check if bd CLI is installed and initialized in the given directory.
 */
async function getBeadsStatus(cwd: string): Promise<BeadsStatus> {
  // Check if bd is installed
  try {
    await execFileAsync("which", ["bd"]);
  } catch {
    return { installed: false, initialized: false };
  }

  // Check if bd is initialized (bd status will fail with exit code 1 if not)
  try {
    const { stdout } = await execFileAsync("bd", ["status", "--json"], {
      cwd,
      timeout: 5000,
    });
    const data = JSON.parse(stdout);
    return {
      installed: true,
      initialized: true,
      totalIssues: data.total_issues,
      openCount: data.open,
      closedCount: data.closed,
      readyCount: data.ready_to_work,
    };
  } catch {
    return { installed: true, initialized: false };
  }
}

/**
 * Run bd command and return JSON output
 */
async function runBdCommand<T>(args: string[], cwd: string): Promise<T | null> {
  try {
    const { stdout } = await execFileAsync("bd", [...args, "--json"], {
      cwd,
      timeout: 10000,
    });
    return JSON.parse(stdout);
  } catch {
    return null;
  }
}

export interface BeadsDeps {
  scanner: ProjectScanner;
}

/**
 * Creates beads-related API routes.
 * All routes are project-scoped and require a projectId parameter.
 *
 * GET /api/projects/:projectId/beads/status - Check if beads is installed and initialized
 * GET /api/projects/:projectId/beads/list - Get all issues
 * GET /api/projects/:projectId/beads/ready - Get ready issues (no blockers)
 */
export function createBeadsRoutes(deps: BeadsDeps): Hono {
  const routes = new Hono();

  // GET /api/projects/:projectId/beads/status - Check beads status for project
  routes.get("/:projectId/beads/status", async (c) => {
    const projectId = c.req.param("projectId") as UrlProjectId;
    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const status = await getBeadsStatus(project.path);
    return c.json(status);
  });

  // GET /api/projects/:projectId/beads/list - Get all issues for project
  routes.get("/:projectId/beads/list", async (c) => {
    const projectId = c.req.param("projectId") as UrlProjectId;
    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const status = await getBeadsStatus(project.path);
    if (!status.initialized) {
      return c.json({ issues: [], status });
    }

    const issues = await runBdCommand<BeadsIssue[]>(["list"], project.path);
    return c.json({ issues: issues ?? [], status });
  });

  // GET /api/projects/:projectId/beads/ready - Get ready issues for project
  routes.get("/:projectId/beads/ready", async (c) => {
    const projectId = c.req.param("projectId") as UrlProjectId;
    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const status = await getBeadsStatus(project.path);
    if (!status.initialized) {
      return c.json({ issues: [], status });
    }

    const issues = await runBdCommand<BeadsIssue[]>(["ready"], project.path);
    return c.json({ issues: issues ?? [], status });
  });

  return routes;
}
