/**
 * Server settings API routes
 */

import { Hono } from "hono";
import { testSSHConnection } from "../sdk/remote-spawn.js";
import type {
  ServerSettings,
  ServerSettingsService,
} from "../services/ServerSettingsService.js";

export interface SettingsRoutesDeps {
  serverSettingsService: ServerSettingsService;
  /** Callback to apply allowedHosts changes at runtime */
  onAllowedHostsChanged?: (value: string | undefined) => void;
}

export function createSettingsRoutes(deps: SettingsRoutesDeps): Hono {
  const app = new Hono();
  const { serverSettingsService, onAllowedHostsChanged } = deps;

  /**
   * GET /api/settings
   * Get all server settings
   */
  app.get("/", (c) => {
    const settings = serverSettingsService.getSettings();
    return c.json({ settings });
  });

  /**
   * PUT /api/settings
   * Update server settings
   */
  app.put("/", async (c) => {
    const body = await c.req.json<Partial<ServerSettings>>();

    const updates: Partial<ServerSettings> = {};

    // Handle boolean settings
    if (typeof body.serviceWorkerEnabled === "boolean") {
      updates.serviceWorkerEnabled = body.serviceWorkerEnabled;
    }

    // Handle remoteExecutors array
    if (Array.isArray(body.remoteExecutors)) {
      // Validate each entry is a non-empty string
      const validExecutors = body.remoteExecutors.filter(
        (e): e is string => typeof e === "string" && e.trim().length > 0,
      );
      updates.remoteExecutors = validExecutors;
    }

    // Handle allowedHosts string ("*", comma-separated hostnames, or undefined to clear)
    if ("allowedHosts" in body) {
      if (
        body.allowedHosts === undefined ||
        body.allowedHosts === null ||
        body.allowedHosts === ""
      ) {
        updates.allowedHosts = undefined;
      } else if (typeof body.allowedHosts === "string") {
        updates.allowedHosts = body.allowedHosts;
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "At least one valid setting is required" }, 400);
    }

    const settings = await serverSettingsService.updateSettings(updates);

    // Apply allowedHosts change to middleware at runtime
    if ("allowedHosts" in updates && onAllowedHostsChanged) {
      onAllowedHostsChanged(settings.allowedHosts);
    }

    return c.json({ settings });
  });

  /**
   * GET /api/settings/remote-executors
   * Get list of configured remote executors
   */
  app.get("/remote-executors", (c) => {
    const settings = serverSettingsService.getSettings();
    return c.json({ executors: settings.remoteExecutors ?? [] });
  });

  /**
   * PUT /api/settings/remote-executors
   * Update list of remote executors
   */
  app.put("/remote-executors", async (c) => {
    const body = await c.req.json<{ executors: string[] }>();

    if (!Array.isArray(body.executors)) {
      return c.json({ error: "executors must be an array" }, 400);
    }

    // Validate each entry is a non-empty string
    const validExecutors = body.executors.filter(
      (e): e is string => typeof e === "string" && e.trim().length > 0,
    );

    await serverSettingsService.updateSettings({
      remoteExecutors: validExecutors,
    });

    return c.json({ executors: validExecutors });
  });

  /**
   * POST /api/settings/remote-executors/:host/test
   * Test SSH connection to a remote executor
   */
  app.post("/remote-executors/:host/test", async (c) => {
    const host = c.req.param("host");

    if (!host || host.trim().length === 0) {
      return c.json({ error: "host is required" }, 400);
    }

    const result = await testSSHConnection(host);
    return c.json(result);
  });

  return app;
}
