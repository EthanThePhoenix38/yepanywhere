/**
 * Remote access API routes.
 */

import { Hono } from "hono";
import type { RemoteAccessService } from "./RemoteAccessService.js";
import type { RemoteSessionService } from "./RemoteSessionService.js";

export interface RemoteAccessRoutesOptions {
  remoteAccessService: RemoteAccessService;
  /** Optional session service for invalidating sessions on password change */
  remoteSessionService?: RemoteSessionService;
}

export function createRemoteAccessRoutes(
  options: RemoteAccessRoutesOptions,
): Hono {
  const { remoteAccessService, remoteSessionService } = options;
  const app = new Hono();

  /**
   * GET /api/remote-access/config
   * Get current remote access configuration.
   */
  app.get("/config", async (c) => {
    const config = remoteAccessService.getConfig();
    return c.json(config);
  });

  /**
   * POST /api/remote-access/configure
   * Configure remote access with username and password.
   * Body: { username: string, password: string }
   */
  app.post("/configure", async (c) => {
    try {
      const body = await c.req.json<{ username: string; password: string }>();

      if (!body.username || !body.password) {
        return c.json({ error: "Username and password are required" }, 400);
      }

      // Get existing username before changing (to invalidate their sessions)
      const existingUsername = remoteAccessService.getUsername();

      await remoteAccessService.configure(body.username, body.password);

      // Invalidate all sessions for the old and new username
      // (handles both password change and username change scenarios)
      if (remoteSessionService) {
        if (existingUsername) {
          const count =
            await remoteSessionService.invalidateUserSessions(existingUsername);
          if (count > 0) {
            console.log(
              `[RemoteAccess] Invalidated ${count} sessions for ${existingUsername}`,
            );
          }
        }
        if (body.username !== existingUsername) {
          const count = await remoteSessionService.invalidateUserSessions(
            body.username,
          );
          if (count > 0) {
            console.log(
              `[RemoteAccess] Invalidated ${count} sessions for ${body.username}`,
            );
          }
        }
      }

      return c.json({ success: true, username: body.username });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to configure";
      return c.json({ error: message }, 400);
    }
  });

  /**
   * POST /api/remote-access/enable
   * Enable remote access (must be configured first).
   */
  app.post("/enable", async (c) => {
    try {
      await remoteAccessService.enable();
      return c.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to enable";
      return c.json({ error: message }, 400);
    }
  });

  /**
   * POST /api/remote-access/disable
   * Disable remote access (keeps credentials).
   */
  app.post("/disable", async (c) => {
    try {
      await remoteAccessService.disable();
      return c.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to disable";
      return c.json({ error: message }, 400);
    }
  });

  /**
   * POST /api/remote-access/clear
   * Clear all credentials and disable remote access.
   */
  app.post("/clear", async (c) => {
    try {
      // Get username before clearing to invalidate their sessions
      const existingUsername = remoteAccessService.getUsername();

      await remoteAccessService.clearCredentials();

      // Invalidate all sessions for the user
      if (remoteSessionService && existingUsername) {
        const count =
          await remoteSessionService.invalidateUserSessions(existingUsername);
        if (count > 0) {
          console.log(
            `[RemoteAccess] Invalidated ${count} sessions for ${existingUsername}`,
          );
        }
      }

      return c.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear";
      return c.json({ error: message }, 400);
    }
  });

  /**
   * GET /api/remote-access/relay
   * Get relay configuration.
   */
  app.get("/relay", async (c) => {
    const relay = remoteAccessService.getRelayConfig();
    return c.json({ relay });
  });

  /**
   * PUT /api/remote-access/relay
   * Set relay URL and username.
   * Body: { url: string, username: string }
   */
  app.put("/relay", async (c) => {
    try {
      const body = await c.req.json<{ url: string; username: string }>();

      if (!body.url || !body.username) {
        return c.json({ error: "URL and username are required" }, 400);
      }

      await remoteAccessService.setRelayConfig({
        url: body.url,
        username: body.username,
      });

      return c.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to set relay config";
      return c.json({ error: message }, 400);
    }
  });

  /**
   * DELETE /api/remote-access/relay
   * Clear relay configuration.
   */
  app.delete("/relay", async (c) => {
    try {
      await remoteAccessService.clearRelayConfig();
      return c.json({ success: true });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to clear relay config";
      return c.json({ error: message }, 400);
    }
  });

  return app;
}
