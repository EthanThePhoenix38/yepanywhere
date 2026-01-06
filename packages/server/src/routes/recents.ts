import { Hono } from "hono";
import type { RecentsService } from "../recents/index.js";

export interface RecentsDeps {
  recentsService: RecentsService;
}

export function createRecentsRoutes(deps: RecentsDeps): Hono {
  const routes = new Hono();

  // GET /api/recents - Get recent session visits
  // Optional query param: ?limit=N (default: all)
  routes.get("/", (c) => {
    const limitParam = c.req.query("limit");
    const limit = limitParam ? Number.parseInt(limitParam, 10) : undefined;

    const recents =
      limit && !Number.isNaN(limit)
        ? deps.recentsService.getRecentsWithLimit(limit)
        : deps.recentsService.getRecents();

    return c.json({ recents });
  });

  // DELETE /api/recents - Clear all recents
  routes.delete("/", async (c) => {
    await deps.recentsService.clear();
    return c.json({ cleared: true });
  });

  // POST /api/recents/visit - Record a session visit
  // Body: { sessionId: string, projectId: string }
  routes.post("/visit", async (c) => {
    let body: { sessionId?: string; projectId?: string } = {};
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: "Invalid JSON body" }, 400);
    }

    if (!body.sessionId || !body.projectId) {
      return c.json({ error: "sessionId and projectId are required" }, 400);
    }

    await deps.recentsService.recordVisit(body.sessionId, body.projectId);
    return c.json({ recorded: true });
  });

  return routes;
}
