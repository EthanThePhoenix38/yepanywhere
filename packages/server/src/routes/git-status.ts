import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type GitFileChange,
  type GitStatusInfo,
  isUrlProjectId,
} from "@yep-anywhere/shared";
import { Hono } from "hono";
import type { ProjectScanner } from "../projects/scanner.js";

const execFileAsync = promisify(execFile);

export interface GitStatusDeps {
  scanner: ProjectScanner;
}

const NOT_A_GIT_REPO: GitStatusInfo = {
  isGitRepo: false,
  branch: null,
  upstream: null,
  ahead: 0,
  behind: 0,
  isClean: true,
  files: [],
};

export function createGitStatusRoutes(deps: GitStatusDeps): Hono {
  const routes = new Hono();

  routes.get("/:projectId/git", async (c) => {
    const projectId = c.req.param("projectId");

    if (!isUrlProjectId(projectId)) {
      return c.json({ error: "Invalid project ID format" }, 400);
    }

    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    try {
      const result = await getGitStatus(project.path);
      return c.json(result);
    } catch (err) {
      if (isNotGitRepoError(err)) {
        return c.json(NOT_A_GIT_REPO);
      }
      return c.json({ error: "Failed to get git status" }, 500);
    }
  });

  return routes;
}

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ stdout: string; stderr: string }> {
  return execFileAsync("git", ["-C", cwd, ...args], {
    maxBuffer: 1024 * 1024,
    timeout: 10_000,
  });
}

function isNotGitRepoError(err: unknown): boolean {
  if (err && typeof err === "object") {
    const e = err as { code?: number | string; stderr?: string };
    if (e.code === 128) return true;
    if (
      typeof e.stderr === "string" &&
      e.stderr.includes("not a git repository")
    )
      return true;
  }
  return false;
}

/** Parse `git diff --numstat` output into a map of path → {added, deleted} */
function parseNumstat(
  output: string,
): Map<string, { added: number | null; deleted: number | null }> {
  const map = new Map<
    string,
    { added: number | null; deleted: number | null }
  >();
  for (const line of output.split("\n")) {
    if (!line) continue;
    const parts = line.split("\t");
    if (parts.length < 3) continue;
    const addedStr = parts[0] ?? "";
    const deletedStr = parts[1] ?? "";
    const path = parts.slice(2).join("\t");
    const added = addedStr === "-" ? null : Number.parseInt(addedStr, 10);
    const deleted = deletedStr === "-" ? null : Number.parseInt(deletedStr, 10);
    map.set(path, { added, deleted });
  }
  return map;
}

/** Status letter from the XY field for a given position */
function statusChar(xy: string | undefined, index: 0 | 1): string | null {
  if (!xy) return null;
  const ch = xy[index];
  return ch && ch !== "." ? ch : null;
}

async function getGitStatus(projectPath: string): Promise<GitStatusInfo> {
  // Run all three commands in parallel
  const [statusResult, numstatUnstaged, numstatStaged] = await Promise.all([
    runGit(projectPath, ["status", "--porcelain=v2", "--branch"]),
    runGit(projectPath, ["diff", "--numstat"]).catch(() => ({
      stdout: "",
      stderr: "",
    })),
    runGit(projectPath, ["diff", "--cached", "--numstat"]).catch(() => ({
      stdout: "",
      stderr: "",
    })),
  ]);

  const unstagedStats = parseNumstat(numstatUnstaged.stdout);
  const stagedStats = parseNumstat(numstatStaged.stdout);

  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  const files: GitFileChange[] = [];

  for (const line of statusResult.stdout.split("\n")) {
    if (!line) continue;

    // Branch headers
    if (line.startsWith("# branch.head ")) {
      const value = line.slice("# branch.head ".length);
      branch = value === "(detached)" ? null : value;
    } else if (line.startsWith("# branch.upstream ")) {
      upstream = line.slice("# branch.upstream ".length);
    } else if (line.startsWith("# branch.ab ")) {
      const match = line.match(/\+(\d+) -(\d+)/);
      if (match?.[1] && match[2]) {
        ahead = Number.parseInt(match[1], 10);
        behind = Number.parseInt(match[2], 10);
      }
    }
    // Ordinary changed entry: "1 XY sub mH mI mW hH hI path"
    else if (line.startsWith("1 ")) {
      const parts = line.split(" ");
      const xy = parts[1];
      const path = parts.slice(8).join(" ");

      const stagedStatus = statusChar(xy, 0);
      const unstagedStatus = statusChar(xy, 1);

      if (stagedStatus) {
        const stats = stagedStats.get(path);
        files.push({
          path,
          status: stagedStatus,
          staged: true,
          linesAdded: stats?.added ?? null,
          linesDeleted: stats?.deleted ?? null,
        });
      }
      if (unstagedStatus) {
        const stats = unstagedStats.get(path);
        files.push({
          path,
          status: unstagedStatus,
          staged: false,
          linesAdded: stats?.added ?? null,
          linesDeleted: stats?.deleted ?? null,
        });
      }
    }
    // Renamed/copied entry: "2 XY sub mH mI mW hH hI X score path\torigPath"
    else if (line.startsWith("2 ")) {
      const parts = line.split(" ");
      const xy = parts[1];
      const pathAndOrig = parts.slice(9).join(" ");
      const tabIdx = pathAndOrig.indexOf("\t");
      const path = tabIdx >= 0 ? pathAndOrig.slice(0, tabIdx) : pathAndOrig;
      const origPath = tabIdx >= 0 ? pathAndOrig.slice(tabIdx + 1) : undefined;

      const stagedStatus = statusChar(xy, 0);
      const unstagedStatus = statusChar(xy, 1);

      if (stagedStatus) {
        const stats = stagedStats.get(path);
        files.push({
          path,
          status: stagedStatus,
          staged: true,
          linesAdded: stats?.added ?? null,
          linesDeleted: stats?.deleted ?? null,
          origPath,
        });
      }
      if (unstagedStatus) {
        const stats = unstagedStats.get(path);
        files.push({
          path,
          status: unstagedStatus,
          staged: false,
          linesAdded: stats?.added ?? null,
          linesDeleted: stats?.deleted ?? null,
          origPath,
        });
      }
    }
    // Untracked: "? path"
    else if (line.startsWith("? ")) {
      const path = line.slice(2);
      files.push({
        path,
        status: "?",
        staged: false,
        linesAdded: null,
        linesDeleted: null,
      });
    }
    // Unmerged: "u XY sub m1 m2 m3 mW h1 h2 h3 path"
    else if (line.startsWith("u ")) {
      const parts = line.split(" ");
      const path = parts.slice(10).join(" ");
      files.push({
        path,
        status: "U",
        staged: false,
        linesAdded: null,
        linesDeleted: null,
      });
    }
  }

  return {
    isGitRepo: true,
    branch,
    upstream,
    ahead,
    behind,
    isClean: files.length === 0,
    files,
  };
}
