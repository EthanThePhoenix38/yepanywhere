/**
 * Claude CLI Login Service
 *
 * Manages the interactive Claude CLI /login flow using tmux.
 * This is needed when Claude SDK auth expires (401) and users can't SSH to the server.
 *
 * Flow:
 * 1. Start detached tmux session running `claude`
 * 2. Send `/login` command
 * 3. Select "Claude account with subscription" (option 1)
 * 4. Parse OAuth URL from output
 * 5. User visits URL, authorizes, gets redirected with code
 * 6. User pastes code back via API
 * 7. CLI completes auth, cleanup tmux session
 */

import { exec, execSync } from "node:child_process";
import { promisify } from "node:util";
import { getLogger } from "../logging/logger.js";
import { whichCommand } from "../sdk/cli-detection.js";

const execAsync = promisify(exec);

const TMUX_SESSION_NAME = "yep-login";

/** Default timeout for the login flow (5 minutes) */
const LOGIN_TIMEOUT_MS = 5 * 60 * 1000;

/** Interval for polling tmux output */
const POLL_INTERVAL_MS = 500;

/** Time to wait after sending /login before selecting option */
const OPTION_SELECT_DELAY_MS = 2000;

export interface ClaudeLoginState {
  status:
    | "idle"
    | "starting"
    | "awaiting-url"
    | "awaiting-code"
    | "complete"
    | "error";
  url?: string;
  error?: string;
  startedAt?: number;
}

export interface ClaudeLoginService {
  /** Check if tmux is available on the system */
  checkTmuxAvailable(): Promise<boolean>;

  /** Start the login flow. Returns the OAuth URL or an error. */
  startLoginFlow(): Promise<{ url: string } | { error: string }>;

  /** Submit the auth code from OAuth callback */
  submitCode(code: string): Promise<{ success: boolean; error?: string }>;

  /** Get current login state */
  getState(): ClaudeLoginState;

  /** Check if login completed successfully */
  checkLoginComplete(): Promise<boolean>;

  /** Cancel and cleanup the login flow */
  cancel(): Promise<void>;
}

export function createClaudeLoginService(): ClaudeLoginService {
  const log = getLogger();
  let state: ClaudeLoginState = { status: "idle" };
  let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

  const checkTmuxAvailable = async (): Promise<boolean> => {
    try {
      execSync(whichCommand("tmux"), {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      });
      return true;
    } catch {
      return false;
    }
  };

  const sessionExists = async (): Promise<boolean> => {
    try {
      await execAsync(`tmux has-session -t ${TMUX_SESSION_NAME}`);
      return true;
    } catch {
      return false;
    }
  };

  const killSession = async (): Promise<void> => {
    try {
      await execAsync(`tmux kill-session -t ${TMUX_SESSION_NAME}`);
    } catch {
      // Session might not exist, ignore
    }
  };

  const capturePane = async (): Promise<string> => {
    try {
      const { stdout } = await execAsync(
        `tmux capture-pane -t ${TMUX_SESSION_NAME} -p`,
      );
      return stdout;
    } catch {
      return "";
    }
  };

  const sendKeys = async (keys: string): Promise<void> => {
    // Escape single quotes in keys by ending the quote, adding escaped quote, starting new quote
    const escapedKeys = keys.replace(/'/g, "'\\''");
    await execAsync(`tmux send-keys -t ${TMUX_SESSION_NAME} '${escapedKeys}'`);
  };

  const sendEnter = async (): Promise<void> => {
    await execAsync(`tmux send-keys -t ${TMUX_SESSION_NAME} Enter`);
  };

  const parseOAuthUrl = (output: string): string | null => {
    // The URL spans multiple lines due to terminal width wrapping
    // Look for the start of the URL and collect until we hit whitespace/newline that doesn't continue the URL
    const urlStart = output.indexOf("https://claude.ai/oauth/");
    if (urlStart === -1) return null;

    // Find the end of the URL by looking for double newline or the prompt
    const afterUrl = output.slice(urlStart);
    const lines = afterUrl.split("\n");

    // Reconstruct URL by joining lines that are part of the URL
    // URL lines won't have leading spaces (they're continuation of previous line)
    let url = "";
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) break; // Empty line = end of URL
      if (trimmed.startsWith("Paste code")) break; // Hit the prompt

      // Check if this looks like URL continuation (no spaces in URL)
      if (url && line.startsWith(" ")) break; // Indented = new content

      url += trimmed;
    }

    // Validate it looks like a complete OAuth URL
    if (url.includes("code_challenge") && url.includes("&state=")) {
      return url;
    }

    return null;
  };

  const waitForUrl = async (): Promise<string | null> => {
    const startTime = Date.now();
    const maxWait = 30000; // 30 seconds max to find URL

    while (Date.now() - startTime < maxWait) {
      const output = await capturePane();
      const url = parseOAuthUrl(output);
      if (url) return url;

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
    }

    return null;
  };

  const checkForSuccess = async (): Promise<boolean> => {
    const output = await capturePane();
    // Look for success indicators in the output
    // The exact text may vary, but typically includes "successfully" or "authenticated"
    const successPatterns = [
      "successfully authenticated",
      "authentication successful",
      "logged in",
      "Login successful",
      /session.*created/i,
    ];

    for (const pattern of successPatterns) {
      if (typeof pattern === "string") {
        if (output.toLowerCase().includes(pattern.toLowerCase())) return true;
      } else {
        if (pattern.test(output)) return true;
      }
    }

    return false;
  };

  const cleanup = async (): Promise<void> => {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
      timeoutHandle = null;
    }
    await killSession();
    state = { status: "idle" };
  };

  const startLoginFlow = async (): Promise<
    { url: string } | { error: string }
  > => {
    // Check if already in progress
    if (
      state.status !== "idle" &&
      state.status !== "error" &&
      state.status !== "complete"
    ) {
      return { error: "Login flow already in progress" };
    }

    // Check tmux availability
    const hasTmux = await checkTmuxAvailable();
    if (!hasTmux) {
      state = { status: "error", error: "tmux is not installed" };
      return {
        error:
          "tmux is required to automate the Claude CLI login flow. Install it with: apt install tmux (or brew install tmux on macOS)",
      };
    }

    // Kill any existing session
    await killSession();

    state = { status: "starting", startedAt: Date.now() };

    try {
      // Start detached tmux session with claude
      log.info({ event: "claude_login_start" }, "Starting Claude login flow");
      await execAsync(`tmux new-session -d -s ${TMUX_SESSION_NAME} 'claude'`);

      // Wait for claude to start
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Send /login command
      state = { ...state, status: "awaiting-url" };
      await sendKeys("/login");
      await sendEnter();

      // Wait for menu, then select option 1 (Claude account)
      await new Promise((resolve) =>
        setTimeout(resolve, OPTION_SELECT_DELAY_MS),
      );
      await sendKeys("1");

      // Poll for OAuth URL
      const url = await waitForUrl();
      if (!url) {
        state = {
          status: "error",
          error: "Failed to get OAuth URL from Claude CLI",
        };
        await cleanup();
        return {
          error:
            "Failed to get OAuth URL. The login flow may have timed out or Claude CLI output changed.",
        };
      }

      state = { status: "awaiting-code", url, startedAt: state.startedAt };

      // Set overall timeout
      timeoutHandle = setTimeout(async () => {
        log.warn(
          { event: "claude_login_timeout" },
          "Claude login flow timed out",
        );
        state = { status: "error", error: "Login flow timed out" };
        await killSession();
      }, LOGIN_TIMEOUT_MS);

      log.info(
        { event: "claude_login_url_captured", urlLength: url.length },
        "Captured OAuth URL",
      );
      return { url };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { event: "claude_login_error", error: message },
        "Failed to start login flow",
      );
      state = { status: "error", error: message };
      await cleanup();
      return { error: `Failed to start login flow: ${message}` };
    }
  };

  const submitCode = async (
    code: string,
  ): Promise<{ success: boolean; error?: string }> => {
    if (state.status !== "awaiting-code") {
      return {
        success: false,
        error: "Not awaiting code. Start login flow first.",
      };
    }

    if (!code || code.trim().length === 0) {
      return { success: false, error: "Code is required" };
    }

    const exists = await sessionExists();
    if (!exists) {
      state = { status: "error", error: "tmux session not found" };
      return {
        success: false,
        error: "Login session expired. Please start again.",
      };
    }

    try {
      log.info({ event: "claude_login_code_submit" }, "Submitting auth code");

      // Send the code to tmux
      await sendKeys(code.trim());
      await sendEnter();

      // Poll for success (short timeout)
      const pollStart = Date.now();
      const pollTimeout = 10000; // 10 seconds

      while (Date.now() - pollStart < pollTimeout) {
        if (await checkForSuccess()) {
          log.info(
            { event: "claude_login_success" },
            "Claude login successful",
          );
          state = { status: "complete" };
          await cleanup();
          return { success: true };
        }
        await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
      }

      // Didn't see explicit success, but code was submitted
      // The login may have succeeded even if we didn't catch the message
      log.info(
        { event: "claude_login_code_submitted" },
        "Auth code submitted, assuming success",
      );
      state = { status: "complete" };
      await cleanup();
      return { success: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      log.error(
        { event: "claude_login_submit_error", error: message },
        "Failed to submit code",
      );
      return { success: false, error: `Failed to submit code: ${message}` };
    }
  };

  const getState = (): ClaudeLoginState => {
    return { ...state };
  };

  const checkLoginComplete = async (): Promise<boolean> => {
    if (state.status === "complete") return true;
    if (state.status !== "awaiting-code") return false;

    const exists = await sessionExists();
    if (!exists) {
      // Session gone = login flow ended (either completed or failed)
      // Since we're in awaiting-code state, assume it failed
      return false;
    }

    return await checkForSuccess();
  };

  const cancel = async (): Promise<void> => {
    log.info({ event: "claude_login_cancel" }, "Cancelling login flow");
    await cleanup();
  };

  return {
    checkTmuxAvailable,
    startLoginFlow,
    submitCode,
    getState,
    checkLoginComplete,
    cancel,
  };
}

// Singleton instance for the application
let serviceInstance: ClaudeLoginService | null = null;

export function getClaudeLoginService(): ClaudeLoginService {
  if (!serviceInstance) {
    serviceInstance = createClaudeLoginService();
  }
  return serviceInstance;
}
