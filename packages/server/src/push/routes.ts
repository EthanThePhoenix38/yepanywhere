/**
 * Push notification API routes
 */

import { Hono } from "hono";
import type { PushService } from "./PushService.js";
import type { NotificationSettings, PushSubscription } from "./types.js";

export interface PushRoutesDeps {
  pushService: PushService;
}

interface SubscribeBody {
  deviceId: string;
  subscription: PushSubscription;
  deviceName?: string;
}

interface UnsubscribeBody {
  deviceId: string;
}

interface TestPushBody {
  deviceId: string;
  message?: string;
}

export function createPushRoutes(deps: PushRoutesDeps): Hono {
  const app = new Hono();
  const { pushService } = deps;

  /**
   * GET /api/push/vapid-public-key
   * Returns the VAPID public key for client subscription
   */
  app.get("/vapid-public-key", (c) => {
    const publicKey = pushService.getPublicKey();

    if (!publicKey) {
      return c.json(
        {
          error: "VAPID keys not configured",
          hint: "Run 'pnpm setup-vapid' to generate keys",
        },
        503,
      );
    }

    return c.json({ publicKey });
  });

  /**
   * POST /api/push/subscribe
   * Subscribe a device for push notifications
   */
  app.post("/subscribe", async (c) => {
    const body = await c.req.json<SubscribeBody>();

    if (!body.deviceId || typeof body.deviceId !== "string") {
      return c.json({ error: "deviceId is required" }, 400);
    }

    if (!body.subscription?.endpoint || !body.subscription?.keys) {
      return c.json({ error: "Valid subscription object is required" }, 400);
    }

    const userAgent = c.req.header("User-Agent");

    await pushService.subscribe(body.deviceId, body.subscription, {
      userAgent,
      deviceName: body.deviceName,
    });

    return c.json({
      success: true,
      deviceId: body.deviceId,
    });
  });

  /**
   * POST /api/push/unsubscribe
   * Unsubscribe a device from push notifications
   */
  app.post("/unsubscribe", async (c) => {
    const body = await c.req.json<UnsubscribeBody>();

    if (!body.deviceId || typeof body.deviceId !== "string") {
      return c.json({ error: "deviceId is required" }, 400);
    }

    const removed = await pushService.unsubscribe(body.deviceId);

    return c.json({
      success: removed,
      deviceId: body.deviceId,
    });
  });

  /**
   * GET /api/push/subscriptions
   * List all push subscriptions (for settings UI)
   */
  app.get("/subscriptions", (c) => {
    const subscriptions = pushService.getSubscriptions();

    // Return sanitized subscription info (hide sensitive keys)
    const sanitized = Object.entries(subscriptions).map(([deviceId, sub]) => ({
      deviceId,
      createdAt: sub.createdAt,
      deviceName: sub.deviceName,
      // Just show domain of endpoint for privacy
      endpointDomain: new URL(sub.subscription.endpoint).hostname,
    }));

    return c.json({
      count: sanitized.length,
      subscriptions: sanitized,
    });
  });

  /**
   * DELETE /api/push/subscriptions/:deviceId
   * Remove a specific subscription
   */
  app.delete("/subscriptions/:deviceId", async (c) => {
    const deviceId = c.req.param("deviceId");
    const removed = await pushService.unsubscribe(deviceId);

    if (!removed) {
      return c.json({ error: "Subscription not found" }, 404);
    }

    return c.json({ success: true });
  });

  /**
   * POST /api/push/test
   * Send a test notification (for debugging)
   */
  app.post("/test", async (c) => {
    const body = await c.req.json<TestPushBody>();

    if (!body.deviceId) {
      return c.json({ error: "deviceId is required" }, 400);
    }

    const result = await pushService.sendTest(
      body.deviceId,
      body.message ?? "Test notification from Yep Anywhere",
    );

    if (!result.success) {
      return c.json(
        {
          success: false,
          error: result.error,
          statusCode: result.statusCode,
        },
        result.statusCode === 404 || result.statusCode === 410 ? 410 : 500,
      );
    }

    return c.json({ success: true });
  });

  /**
   * GET /api/push/settings
   * Get notification settings (what types of notifications are sent)
   */
  app.get("/settings", (c) => {
    const settings = pushService.getNotificationSettings();
    return c.json({ settings });
  });

  /**
   * PUT /api/push/settings
   * Update notification settings
   */
  app.put("/settings", async (c) => {
    const body = await c.req.json<Partial<NotificationSettings>>();

    // Validate that we got at least one setting
    const validKeys = [
      "toolApproval",
      "userQuestion",
      "sessionHalted",
    ] as const;
    const updates: Partial<NotificationSettings> = {};

    for (const key of validKeys) {
      if (typeof body[key] === "boolean") {
        updates[key] = body[key];
      }
    }

    if (Object.keys(updates).length === 0) {
      return c.json({ error: "At least one valid setting is required" }, 400);
    }

    const settings = await pushService.setNotificationSettings(updates);
    return c.json({ settings });
  });

  return app;
}
