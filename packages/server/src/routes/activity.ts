import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import type {
  BrowserProfileService,
  ConnectedBrowsersService,
} from "../services/index.js";
import { createActivitySubscription } from "../subscriptions.js";
import type { EventBus } from "../watcher/index.js";

export interface ActivityDeps {
  eventBus: EventBus;
  connectedBrowsers?: ConnectedBrowsersService;
  browserProfileService?: BrowserProfileService;
}

export function createActivityRoutes(deps: ActivityDeps): Hono {
  const routes = new Hono();

  // GET /api/activity/events - SSE endpoint for all real-time events
  routes.get("/events", async (c) => {
    // Extract browserProfileId and origin metadata from query string
    const browserProfileId = c.req.query("browserProfileId");
    const origin = c.req.query("origin");
    const scheme = c.req.query("scheme");
    const hostname = c.req.query("hostname");
    const portStr = c.req.query("port");
    const userAgent = c.req.query("userAgent");

    // Register connection if we have tracking and a browserProfileId
    let connectionId: number | undefined;
    if (deps.connectedBrowsers && browserProfileId) {
      connectionId = deps.connectedBrowsers.connect(browserProfileId, "sse");
    }

    // Record origin metadata if available
    if (deps.browserProfileService && browserProfileId && origin) {
      deps.browserProfileService
        .recordConnection(browserProfileId, {
          origin,
          scheme: scheme || "http",
          hostname: hostname || "unknown",
          port: portStr ? Number.parseInt(portStr, 10) : null,
          userAgent: userAgent || "",
        })
        .catch((err) => {
          console.warn(
            "[Activity] Failed to record browser profile origin:",
            err,
          );
        });
    }

    return streamSSE(c, async (stream) => {
      let eventId = 0;
      let closed = false;

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

      const { cleanup } = createActivitySubscription(deps.eventBus, sseEmit, {
        onError: () => {
          closed = true;
        },
      });

      // Cleanup function to unregister browser connection
      const disconnectBrowser = () => {
        if (connectionId !== undefined && deps.connectedBrowsers) {
          deps.connectedBrowsers.disconnect(connectionId);
        }
      };

      // Handle stream close
      stream.onAbort(() => {
        closed = true;
        cleanup();
        disconnectBrowser();
      });

      // Keep stream open indefinitely (until client disconnects)
      await new Promise<void>((resolve) => {
        const checkClosed = setInterval(() => {
          if (closed) {
            clearInterval(checkClosed);
            resolve();
          }
        }, 1000);

        stream.onAbort(() => {
          clearInterval(checkClosed);
          resolve();
        });
      });
    });
  });

  // GET /api/activity/status - Get watcher status
  routes.get("/status", (c) => {
    return c.json({
      subscribers: deps.eventBus.subscriberCount,
      timestamp: new Date().toISOString(),
    });
  });

  // GET /api/activity/connections - Get snapshot of connected browser tabs
  routes.get("/connections", (c) => {
    if (!deps.connectedBrowsers) {
      return c.json({
        connections: [],
        deviceCount: 0,
        totalTabCount: 0,
      });
    }

    return c.json({
      connections: deps.connectedBrowsers.getAllConnections(),
      browserProfileCount:
        deps.connectedBrowsers.getConnectedBrowserProfileIds().length,
      totalTabCount: deps.connectedBrowsers.getTotalTabCount(),
    });
  });

  return routes;
}
