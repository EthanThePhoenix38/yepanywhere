/**
 * Authentication API routes
 */

import { spawnSync } from "node:child_process";
import { Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { getLogger } from "../logging/logger.js";
import type { AuthService } from "./AuthService.js";
import { getClaudeLoginService } from "./claude-login.js";

export const SESSION_COOKIE_NAME = "yep-anywhere-session";

export interface AuthRoutesDeps {
  authService: AuthService;
  /** Whether auth is disabled by env var (--auth-disable). Overrides settings. */
  authDisabled?: boolean;
}

interface SetupBody {
  password: string;
}

interface LoginBody {
  password: string;
}

interface ChangePasswordBody {
  newPassword: string;
}

export function createAuthRoutes(deps: AuthRoutesDeps): Hono {
  const app = new Hono();
  const { authService, authDisabled = false } = deps;

  /**
   * GET /api/auth/status
   * Check authentication status
   *
   * Returns:
   * - enabled: whether auth is enabled (from settings)
   * - authenticated: whether user has valid session
   * - setupRequired: whether initial setup is needed (enabled but no account)
   * - disabledByEnv: whether auth is disabled by --auth-disable flag
   * - authFilePath: path to auth.json (for recovery instructions)
   */
  app.get("/status", async (c) => {
    const isEnabled = authService.isEnabled();

    // If auth is disabled by env var, it overrides settings
    if (authDisabled) {
      return c.json({
        enabled: isEnabled,
        authenticated: true, // Bypass auth
        setupRequired: false,
        disabledByEnv: true,
        authFilePath: authService.getFilePath(),
      });
    }

    // If auth is not enabled in settings, no auth required
    if (!isEnabled) {
      return c.json({
        enabled: false,
        authenticated: true, // No auth needed
        setupRequired: false,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    // Auth is enabled - check session
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    const hasAccount = authService.hasAccount();

    if (!hasAccount) {
      // This shouldn't happen normally since enableAuth creates account,
      // but handle edge case
      return c.json({
        enabled: true,
        authenticated: false,
        setupRequired: true,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    if (!sessionId) {
      return c.json({
        enabled: true,
        authenticated: false,
        setupRequired: false,
        disabledByEnv: false,
        authFilePath: authService.getFilePath(),
      });
    }

    const valid = await authService.validateSession(sessionId);
    return c.json({
      enabled: true,
      authenticated: valid,
      setupRequired: false,
      disabledByEnv: false,
      authFilePath: authService.getFilePath(),
    });
  });

  /**
   * POST /api/auth/enable
   * Enable auth with a password (main way to enable from settings UI)
   */
  app.post("/enable", async (c) => {
    const body = await c.req.json<SetupBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    if (body.password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    const success = await authService.enableAuth(body.password);
    if (!success) {
      return c.json({ error: "Failed to enable auth" }, 500);
    }

    // Don't auto-login - require user to log in with their new password
    return c.json({ success: true });
  });

  /**
   * POST /api/auth/disable
   * Disable auth (requires authenticated session)
   */
  app.post("/disable", async (c) => {
    // Require authenticated session to disable
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionId || !(await authService.validateSession(sessionId))) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    await authService.disableAuth();

    // Clear the session cookie
    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/",
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/setup
   * Create the initial account (only works when no account exists)
   * @deprecated Use /api/auth/enable instead
   */
  app.post("/setup", async (c) => {
    if (authService.hasAccount()) {
      return c.json({ error: "Account already exists" }, 400);
    }

    const body = await c.req.json<SetupBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    if (body.password.length < 6) {
      return c.json({ error: "Password must be at least 6 characters" }, 400);
    }

    // Use enableAuth to also set the enabled flag
    const success = await authService.enableAuth(body.password);
    if (!success) {
      return c.json({ error: "Failed to create account" }, 500);
    }

    // Auto-login after setup
    const userAgent = c.req.header("User-Agent");
    const sessionId = await authService.createSession(userAgent);

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/login
   * Login with password
   */
  app.post("/login", async (c) => {
    if (!authService.hasAccount()) {
      c.header("X-Setup-Required", "true");
      return c.json(
        { error: "No account configured", setupRequired: true },
        401,
      );
    }

    const body = await c.req.json<LoginBody>();

    if (!body.password || typeof body.password !== "string") {
      return c.json({ error: "Password is required" }, 400);
    }

    const valid = await authService.verifyPassword(body.password);
    if (!valid) {
      return c.json({ error: "Invalid password" }, 401);
    }

    const userAgent = c.req.header("User-Agent");
    const sessionId = await authService.createSession(userAgent);

    setCookie(c, SESSION_COOKIE_NAME, sessionId, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/",
      maxAge: 30 * 24 * 60 * 60, // 30 days
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/logout
   * Logout (invalidate session)
   */
  app.post("/logout", async (c) => {
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);

    if (sessionId) {
      await authService.invalidateSession(sessionId);
    }

    deleteCookie(c, SESSION_COOKIE_NAME, {
      path: "/",
    });

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/change-password
   * Change password (requires authenticated session)
   */
  app.post("/change-password", async (c) => {
    // Require authenticated session
    const sessionId = getCookie(c, SESSION_COOKIE_NAME);
    if (!sessionId || !(await authService.validateSession(sessionId))) {
      return c.json({ error: "Not authenticated" }, 401);
    }

    const body = await c.req.json<ChangePasswordBody>();

    if (!body.newPassword || typeof body.newPassword !== "string") {
      return c.json({ error: "New password is required" }, 400);
    }

    if (body.newPassword.length < 6) {
      return c.json(
        { error: "New password must be at least 6 characters" },
        400,
      );
    }

    const success = await authService.changePassword(body.newPassword);
    if (!success) {
      return c.json({ error: "Failed to change password" }, 500);
    }

    return c.json({ success: true });
  });

  // Claude CLI Login Flow endpoints
  // These handle re-authentication when Claude SDK auth expires

  /**
   * GET /api/auth/claude-login/status
   * Get current Claude login flow status
   */
  app.get("/claude-login/status", async (c) => {
    const claudeLogin = getClaudeLoginService();
    const state = claudeLogin.getState();
    return c.json(state);
  });

  /**
   * POST /api/auth/claude-login/start
   * Start the Claude CLI login flow
   * Returns the OAuth URL for the user to visit
   */
  app.post("/claude-login/start", async (c) => {
    const claudeLogin = getClaudeLoginService();
    const result = await claudeLogin.startLoginFlow();

    if ("error" in result) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true, url: result.url });
  });

  /**
   * POST /api/auth/claude-login/code
   * Submit the auth code from OAuth callback
   */
  app.post("/claude-login/code", async (c) => {
    const body = await c.req.json<{ code: string }>();

    if (!body.code || typeof body.code !== "string") {
      return c.json({ success: false, error: "Code is required" }, 400);
    }

    const claudeLogin = getClaudeLoginService();
    const result = await claudeLogin.submitCode(body.code);

    if (!result.success) {
      return c.json({ success: false, error: result.error }, 400);
    }

    return c.json({ success: true });
  });

  /**
   * POST /api/auth/claude-login/cancel
   * Cancel the current login flow
   */
  app.post("/claude-login/cancel", async (c) => {
    const claudeLogin = getClaudeLoginService();
    await claudeLogin.cancel();
    return c.json({ success: true });
  });

  /**
   * GET /api/auth/claude-login/tmux
   * Check if tmux is available
   */
  app.get("/claude-login/tmux", async (c) => {
    const claudeLogin = getClaudeLoginService();
    const available = await claudeLogin.checkTmuxAvailable();
    return c.json({ available });
  });

  /**
   * POST /api/auth/claude-login/apikey
   * Set Claude API key directly (no tmux needed)
   * Uses `claude config set apiKey <key>` command
   */
  app.post("/claude-login/apikey", async (c) => {
    const log = getLogger();
    const body = await c.req.json<{ apiKey: string }>();

    if (!body.apiKey || typeof body.apiKey !== "string") {
      return c.json({ success: false, error: "API key is required" }, 400);
    }

    const apiKey = body.apiKey.trim();

    // Basic validation - Anthropic API keys start with "sk-ant-"
    if (!apiKey.startsWith("sk-ant-")) {
      return c.json(
        {
          success: false,
          error:
            "Invalid API key format. Anthropic API keys start with 'sk-ant-'",
        },
        400,
      );
    }

    // Use claude CLI to set the API key
    // This ensures proper config file handling
    // Using spawnSync with args array to prevent command injection
    log.info({ event: "claude_apikey_set" }, "Setting Claude API key");
    const result = spawnSync("claude", ["config", "set", "apiKey", apiKey], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    });

    if (result.error) {
      const message = result.error.message;
      log.error(
        { event: "claude_apikey_error", error: message },
        "Failed to set Claude API key",
      );
      return c.json(
        { success: false, error: `Failed to set API key: ${message}` },
        500,
      );
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.trim() || "Unknown error";
      log.error(
        {
          event: "claude_apikey_error",
          error: stderr,
          exitCode: result.status,
        },
        "Claude config command failed",
      );
      return c.json(
        { success: false, error: `Failed to set API key: ${stderr}` },
        500,
      );
    }

    log.info(
      { event: "claude_apikey_success" },
      "Claude API key set successfully",
    );
    return c.json({ success: true });
  });

  return app;
}
