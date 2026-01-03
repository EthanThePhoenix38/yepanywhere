/**
 * Codex Provider implementation using `codex exec --json`.
 *
 * This provider enables using OpenAI's Codex CLI as an agent backend.
 * It spawns the Codex CLI process and parses its JSONL output stream.
 */

import { type ChildProcess, execSync, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import type {
  CodexAgentMessage,
  CodexAgentReasoning,
  CodexEvent,
  CodexSessionMeta,
  CodexTokenCount,
  CodexUserMessage,
} from "@claude-anywhere/shared";
import { parseCodexEvent } from "@claude-anywhere/shared";
import { MessageQueue } from "../messageQueue.js";
import type { ContentBlock, SDKMessage, UserMessage } from "../types.js";
import type {
  AgentProvider,
  AgentSession,
  AuthStatus,
  StartSessionOptions,
} from "./types.js";

/**
 * Configuration for Codex provider.
 */
export interface CodexProviderConfig {
  /** Path to codex binary (auto-detected if not specified) */
  codexPath?: string;
  /** Request timeout in ms (default: 300000 = 5 minutes) */
  timeout?: number;
}

/**
 * Auth info from ~/.codex/auth.json
 */
interface CodexAuthJson {
  api_key?: string;
  expires_at?: string;
  user?: {
    email?: string;
    name?: string;
  };
}

/**
 * Codex Provider implementation.
 *
 * Uses the Codex CLI's `exec --json` mode for non-interactive sessions.
 * Parses JSONL output and normalizes events to our SDKMessage format.
 */
export class CodexProvider implements AgentProvider {
  readonly name = "codex" as const;
  readonly displayName = "Codex";

  private readonly codexPath?: string;
  private readonly timeout: number;

  constructor(config: CodexProviderConfig = {}) {
    this.codexPath = config.codexPath;
    this.timeout = config.timeout ?? 300000; // 5 minutes default
  }

  /**
   * Check if the Codex CLI is installed.
   */
  async isInstalled(): Promise<boolean> {
    const path = this.findCodexPath();
    return path !== null;
  }

  /**
   * Check if Codex is authenticated.
   */
  async isAuthenticated(): Promise<boolean> {
    const authStatus = await this.getAuthStatus();
    return authStatus.authenticated;
  }

  /**
   * Get detailed authentication status.
   */
  async getAuthStatus(): Promise<AuthStatus> {
    const installed = await this.isInstalled();
    if (!installed) {
      return {
        installed: false,
        authenticated: false,
        enabled: false,
      };
    }

    // Read auth from ~/.codex/auth.json
    const authPath = join(homedir(), ".codex", "auth.json");
    if (!existsSync(authPath)) {
      return {
        installed: true,
        authenticated: false,
        enabled: false,
      };
    }

    try {
      const authData: CodexAuthJson = JSON.parse(
        readFileSync(authPath, "utf-8"),
      );

      // Check if API key exists
      if (!authData.api_key) {
        return {
          installed: true,
          authenticated: false,
          enabled: false,
        };
      }

      // Check expiry
      let expiresAt: Date | undefined;
      let authenticated = true;
      if (authData.expires_at) {
        expiresAt = new Date(authData.expires_at);
        if (expiresAt < new Date()) {
          authenticated = false;
        }
      }

      return {
        installed: true,
        authenticated,
        enabled: authenticated,
        expiresAt,
        user: authData.user,
      };
    } catch {
      return {
        installed: true,
        authenticated: false,
        enabled: false,
      };
    }
  }

  /**
   * Start a new Codex session.
   */
  async startSession(options: StartSessionOptions): Promise<AgentSession> {
    const queue = new MessageQueue();
    const abortController = new AbortController();

    // Push initial message if provided
    if (options.initialMessage) {
      queue.push(options.initialMessage);
    }

    const iterator = this.runSession(
      options.cwd,
      queue,
      abortController.signal,
      options,
    );

    return {
      iterator,
      queue,
      abort: () => abortController.abort(),
    };
  }

  /**
   * Main session loop.
   */
  private async *runSession(
    cwd: string,
    queue: MessageQueue,
    signal: AbortSignal,
    options: StartSessionOptions,
  ): AsyncIterableIterator<SDKMessage> {
    const codexPath = this.findCodexPath();
    if (!codexPath) {
      yield {
        type: "error",
        error: "Codex CLI not found",
      } as SDKMessage;
      return;
    }

    // Generate a session ID
    const sessionId = `codex-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    // Emit init message
    yield {
      type: "system",
      subtype: "init",
      session_id: sessionId,
      cwd,
    } as SDKMessage;

    // Wait for initial message from queue
    const messageGen = queue.generator();
    const firstMessage = await messageGen.next();
    if (firstMessage.done) {
      yield {
        type: "result",
        session_id: sessionId,
        result: "No message provided",
      } as SDKMessage;
      return;
    }

    // Extract text from the user message
    const userPrompt = this.extractTextFromMessage(firstMessage.value);

    // Emit user message
    yield {
      type: "user",
      session_id: sessionId,
      message: {
        role: "user",
        content: userPrompt,
      },
    } as SDKMessage;

    // Build codex command arguments
    const args = ["exec", "--json"];

    // Add working directory
    args.push("-C", cwd);

    // Add model if specified
    if (options.model) {
      args.push("--model", options.model);
    }

    // Add permission mode equivalent
    // Codex uses --auto-approve for full auto mode
    if (options.permissionMode === "bypassPermissions") {
      args.push("--auto-approve");
    }

    // Add the prompt
    args.push(userPrompt);

    // Spawn the codex process
    let codexProcess: ChildProcess;
    try {
      codexProcess = spawn(codexPath, args, {
        cwd,
        stdio: ["pipe", "pipe", "pipe"],
        env: {
          ...process.env,
          // Ensure JSON output mode
          CODEX_OUTPUT_FORMAT: "json",
        },
      });
    } catch (error) {
      yield {
        type: "error",
        session_id: sessionId,
        error: `Failed to spawn Codex process: ${error instanceof Error ? error.message : String(error)}`,
      } as SDKMessage;
      return;
    }

    // Handle abort
    const abortHandler = () => {
      codexProcess.kill("SIGTERM");
    };
    signal.addEventListener("abort", abortHandler);

    // Set up timeout
    const timeoutId = setTimeout(() => {
      codexProcess.kill("SIGTERM");
    }, this.timeout);

    try {
      // Parse JSONL from stdout
      if (!codexProcess.stdout) {
        yield {
          type: "error",
          session_id: sessionId,
          error: "Codex process has no stdout",
        } as SDKMessage;
        return;
      }

      const rl = createInterface({
        input: codexProcess.stdout,
        crlfDelay: Number.POSITIVE_INFINITY,
      });

      let realSessionId: string | undefined;
      let lastTokenCount: CodexTokenCount | undefined;

      for await (const line of rl) {
        if (signal.aborted) break;

        const event = parseCodexEvent(line);
        if (!event) continue;

        // Convert Codex event to SDKMessage
        const sdkMessage = this.convertEventToSDKMessage(
          event,
          realSessionId ?? sessionId,
        );
        if (sdkMessage) {
          // Update real session ID if we got it
          if (event.type === "session_meta") {
            const meta = event as CodexSessionMeta;
            if (meta.session_id) {
              realSessionId = meta.session_id;
              // Update session_id in the message
              sdkMessage.session_id = realSessionId;
            }
          }

          // Track token count for final result
          if (
            event.type === "event_msg" &&
            (event as { event_type?: string }).event_type === "token_count"
          ) {
            lastTokenCount = event as CodexTokenCount;
          }

          yield sdkMessage;
        }
      }

      // Wait for process to exit
      const exitCode = await new Promise<number | null>((resolve) => {
        codexProcess.on("close", resolve);
        codexProcess.on("error", () => resolve(null));
      });

      // Emit result message
      yield {
        type: "result",
        session_id: realSessionId ?? sessionId,
        exitCode,
        usage: lastTokenCount
          ? {
              input_tokens: lastTokenCount.input_tokens,
              output_tokens: lastTokenCount.output_tokens,
            }
          : undefined,
      } as SDKMessage;
    } finally {
      clearTimeout(timeoutId);
      signal.removeEventListener("abort", abortHandler);

      // Ensure process is killed
      if (!codexProcess.killed) {
        codexProcess.kill("SIGTERM");
      }
    }
  }

  /**
   * Convert a Codex event to an SDKMessage.
   */
  private convertEventToSDKMessage(
    event: CodexEvent,
    sessionId: string,
  ): SDKMessage | null {
    switch (event.type) {
      case "session_meta": {
        const meta = event as CodexSessionMeta;
        return {
          type: "system",
          subtype: "init",
          session_id: meta.session_id ?? sessionId,
          model: meta.model,
          cwd: meta.cwd,
        } as SDKMessage;
      }

      case "event_msg": {
        const eventMsg = event as
          | CodexUserMessage
          | CodexAgentMessage
          | CodexAgentReasoning
          | CodexTokenCount;

        switch (eventMsg.event_type) {
          case "user_message": {
            const userMsg = eventMsg as CodexUserMessage;
            return {
              type: "user",
              session_id: sessionId,
              uuid: userMsg.id,
              timestamp: userMsg.timestamp,
              message: {
                role: "user",
                content: this.normalizeContent(userMsg.content),
              },
            } as SDKMessage;
          }

          case "agent_message": {
            const agentMsg = eventMsg as CodexAgentMessage;
            return {
              type: "assistant",
              session_id: sessionId,
              uuid: agentMsg.id,
              timestamp: agentMsg.timestamp,
              message: {
                role: "assistant",
                content: this.normalizeContent(agentMsg.content),
                stop_reason: agentMsg.stop_reason,
              },
            } as SDKMessage;
          }

          case "agent_reasoning": {
            const reasoning = eventMsg as CodexAgentReasoning;
            // Convert reasoning to text content (with thinking prefix)
            // Note: Our ContentBlock doesn't support "thinking" type
            const thinkingText = reasoning.summary ?? "(encrypted reasoning)";
            return {
              type: "assistant",
              session_id: sessionId,
              uuid: reasoning.id,
              timestamp: reasoning.timestamp,
              message: {
                role: "assistant",
                content: `<thinking>\n${thinkingText}\n</thinking>`,
              },
            } as SDKMessage;
          }

          case "token_count": {
            // Token counts are tracked but not emitted as separate messages
            return null;
          }
        }
        break;
      }

      case "response_item": {
        // Response items are already covered by event_msg
        return null;
      }

      case "turn_context": {
        // Turn context is metadata, not a message
        return null;
      }

      case "error": {
        return {
          type: "error",
          session_id: sessionId,
          error: event.error,
        } as SDKMessage;
      }

      case "result": {
        return {
          type: "result",
          session_id: sessionId,
          result: event.message ?? "completed",
          total_cost_usd: event.total_cost_usd,
        } as SDKMessage;
      }
    }

    return null;
  }

  /**
   * Normalize Codex content to our content block format.
   */
  private normalizeContent(
    content: string | unknown[],
  ): string | ContentBlock[] {
    if (typeof content === "string") {
      return content;
    }

    if (!Array.isArray(content)) {
      return String(content);
    }

    return content.map((block): ContentBlock => {
      if (typeof block !== "object" || block === null) {
        return { type: "text", text: String(block) };
      }

      const typed = block as { type?: string };
      switch (typed.type) {
        case "text":
          return {
            type: "text",
            text: (block as { text?: string }).text ?? "",
          };

        case "function_call":
          return {
            type: "tool_use",
            id: (block as { id?: string }).id ?? "",
            name: (block as { name?: string }).name ?? "",
            input: this.parseToolInput(
              (block as { arguments?: string }).arguments,
            ),
          };

        case "function_call_output":
          return {
            type: "tool_result",
            tool_use_id: (block as { call_id?: string }).call_id ?? "",
            content: (block as { output?: string }).output ?? "",
          };

        case "reasoning": {
          // Convert reasoning to text content (with thinking prefix)
          // Note: Our ContentBlock doesn't support "thinking" type
          const reasoningText =
            (
              (block as { summary?: unknown[] }).summary as
                | Array<{ text?: string }>
                | undefined
            )
              ?.map((s) => s.text)
              .join("\n") ?? "";
          return {
            type: "text",
            text: `<thinking>\n${reasoningText}\n</thinking>`,
          };
        }

        default:
          return { type: "text", text: JSON.stringify(block) };
      }
    });
  }

  /**
   * Parse tool input from JSON string.
   */
  private parseToolInput(input: string | undefined): unknown {
    if (!input) return {};
    try {
      return JSON.parse(input);
    } catch {
      return { raw: input };
    }
  }

  /**
   * Extract text content from a user message.
   * Handles both UserMessage format (text field) and SDK message format (message.content).
   */
  private extractTextFromMessage(message: unknown): string {
    if (!message || typeof message !== "object") {
      return "";
    }

    // Handle UserMessage format
    const userMsg = message as { text?: string };
    if (typeof userMsg.text === "string") {
      return userMsg.text;
    }

    // Handle SDK message format (from queue generator): { message: { content: ... } }
    const sdkMsg = message as {
      message?: { content?: string | unknown[] };
    };
    const content = sdkMsg.message?.content;

    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      return content
        .map((block: unknown) => {
          if (typeof block === "string") return block;
          if (
            typeof block === "object" &&
            block !== null &&
            "type" in block &&
            (block as { type: string }).type === "text" &&
            "text" in block
          ) {
            return (block as { text: string }).text;
          }
          return "";
        })
        .filter(Boolean)
        .join("\n");
    }

    return "";
  }

  /**
   * Find the Codex CLI path.
   */
  private findCodexPath(): string | null {
    // Use configured path if provided
    if (this.codexPath && existsSync(this.codexPath)) {
      return this.codexPath;
    }

    // Check common locations
    const commonPaths = [
      join(homedir(), ".local", "bin", "codex"),
      "/usr/local/bin/codex",
      join(homedir(), ".cargo", "bin", "codex"),
      join(homedir(), ".codex", "bin", "codex"),
    ];

    for (const path of commonPaths) {
      if (existsSync(path)) {
        return path;
      }
    }

    // Try to find in PATH using which
    try {
      const result = execSync("which codex", { encoding: "utf-8" }).trim();
      if (result && existsSync(result)) {
        return result;
      }
    } catch {
      // Not in PATH
    }

    return null;
  }
}

/**
 * Default Codex provider instance.
 */
export const codexProvider = new CodexProvider();
