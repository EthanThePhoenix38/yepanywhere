import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { createSessionSubscription } from "../subscriptions.js";
import type { Supervisor } from "../supervisor/Supervisor.js";

export interface StreamDeps {
  supervisor: Supervisor;
}

export function createStreamRoutes(deps: StreamDeps): Hono {
  const routes = new Hono();

  // GET /api/sessions/:sessionId/stream - SSE endpoint
  routes.get("/sessions/:sessionId/stream", async (c) => {
    const sessionId = c.req.param("sessionId");

    const process = deps.supervisor.getProcessForSession(sessionId);
    if (!process) {
      return c.json({ error: "No active process for session" }, 404);
    }

    return streamSSE(c, async (stream) => {
      let eventId = 0;
      let completed = false;

      const sseEmit = (eventType: string, data: unknown) => {
        stream
          .writeSSE({
            id: String(eventId++),
            event: eventType,
            data: JSON.stringify(data),
          })
          .catch(() => {
            // Stream closed
          });
      };

      const { cleanup } = createSessionSubscription(process, sseEmit, {
        onError: () => {
          completed = true;
        },
      });

      // Keep stream open until process completes or client disconnects
      await new Promise<void>((resolve) => {
        if (completed) {
          resolve();
          return;
        }

        const unsubscribeCompletion = process.subscribe((event) => {
          if (event.type === "complete") {
            unsubscribeCompletion();
            resolve();
          }
        });

        stream.onAbort(() => {
          completed = true;
          cleanup();
          unsubscribeCompletion();
          resolve();
        });

        if (completed) {
          unsubscribeCompletion();
          resolve();
        }
      });
    });
  });

  return routes;
}
