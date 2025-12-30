import { Hono } from "hono";
import type { ProjectScanner } from "../projects/scanner.js";
import type { SessionReader } from "../sessions/reader.js";
import type { ExternalSessionTracker } from "../supervisor/ExternalSessionTracker.js";
import type { Supervisor } from "../supervisor/Supervisor.js";

export interface ProjectsDeps {
  scanner: ProjectScanner;
  readerFactory: (sessionDir: string) => SessionReader;
  supervisor?: Supervisor;
  externalTracker?: ExternalSessionTracker;
}

interface ProjectActivityCounts {
  activeOwnedCount: number;
  activeExternalCount: number;
}

function getProjectActivityCounts(
  supervisor: Supervisor | undefined,
  externalTracker: ExternalSessionTracker | undefined,
): Map<string, ProjectActivityCounts> {
  const counts = new Map<string, ProjectActivityCounts>();

  // Count owned sessions from Supervisor
  if (supervisor) {
    for (const process of supervisor.getAllProcesses()) {
      const existing = counts.get(process.projectId) || {
        activeOwnedCount: 0,
        activeExternalCount: 0,
      };
      existing.activeOwnedCount++;
      counts.set(process.projectId, existing);
    }
  }

  // Count external sessions
  if (externalTracker) {
    for (const sessionId of externalTracker.getExternalSessions()) {
      const info = externalTracker.getExternalSessionInfo(sessionId);
      if (info) {
        const existing = counts.get(info.projectId) || {
          activeOwnedCount: 0,
          activeExternalCount: 0,
        };
        existing.activeExternalCount++;
        counts.set(info.projectId, existing);
      }
    }
  }

  return counts;
}

export function createProjectsRoutes(deps: ProjectsDeps): Hono {
  const routes = new Hono();

  // Helper to enrich sessions with real status from Supervisor/ExternalTracker
  function enrichSessionsWithStatus<
    T extends { id: string; status: { state: string } },
  >(sessions: T[]): T[] {
    return sessions.map((session) => {
      const process = deps.supervisor?.getProcessForSession(session.id);
      const isExternal = deps.externalTracker?.isExternal(session.id) ?? false;

      const status = process
        ? {
            state: "owned" as const,
            processId: process.id,
            permissionMode: process.permissionMode,
            modeVersion: process.modeVersion,
          }
        : isExternal
          ? { state: "external" as const }
          : session.status;

      return { ...session, status };
    });
  }

  // GET /api/projects - List all projects
  routes.get("/", async (c) => {
    const rawProjects = await deps.scanner.listProjects();
    const activityCounts = getProjectActivityCounts(
      deps.supervisor,
      deps.externalTracker,
    );

    // Enrich projects with active counts
    const projects = rawProjects.map((project) => ({
      ...project,
      activeOwnedCount: activityCounts.get(project.id)?.activeOwnedCount ?? 0,
      activeExternalCount:
        activityCounts.get(project.id)?.activeExternalCount ?? 0,
    }));

    // Sort by lastActivity descending (most recent first), nulls last
    projects.sort((a, b) => {
      if (!a.lastActivity && !b.lastActivity) return 0;
      if (!a.lastActivity) return 1;
      if (!b.lastActivity) return -1;
      return (
        new Date(b.lastActivity).getTime() - new Date(a.lastActivity).getTime()
      );
    });

    return c.json({ projects });
  });

  // GET /api/projects/:projectId - Get project with sessions
  routes.get("/:projectId", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    // Get sessions for this project using the stored sessionDir
    const reader = deps.readerFactory(project.sessionDir);
    const sessions = await reader.listSessions(projectId);

    return c.json({ project, sessions: enrichSessionsWithStatus(sessions) });
  });

  // GET /api/projects/:projectId/sessions - List sessions
  routes.get("/:projectId/sessions", async (c) => {
    const projectId = c.req.param("projectId");

    const project = await deps.scanner.getProject(projectId);
    if (!project) {
      return c.json({ error: "Project not found" }, 404);
    }

    const reader = deps.readerFactory(project.sessionDir);
    const sessions = await reader.listSessions(projectId);

    return c.json({ sessions: enrichSessionsWithStatus(sessions) });
  });

  return routes;
}
