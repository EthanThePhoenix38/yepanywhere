import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";

export interface AppConfig {
  setup_complete: boolean;
  agents: string[];
  port: number;
  start_minimized: boolean;
}

export async function getConfig(): Promise<AppConfig> {
  return invoke("get_config");
}

export async function saveConfig(config: AppConfig): Promise<void> {
  return invoke("save_app_config", { cfg: config });
}

export async function getDataDir(): Promise<string> {
  return invoke("get_data_dir");
}

export async function startServer(): Promise<void> {
  return invoke("start_server");
}

export async function stopServer(): Promise<void> {
  return invoke("stop_server");
}

export async function getServerStatus(): Promise<string> {
  return invoke("get_server_status");
}

export async function installYepServer(): Promise<void> {
  return invoke("install_yep_server");
}

export async function installClaude(): Promise<void> {
  return invoke("install_claude");
}

export async function installCodex(): Promise<void> {
  return invoke("install_codex");
}

export async function checkAgentInstalled(agent: string): Promise<boolean> {
  return invoke("check_agent_installed", { agent });
}

export async function spawnPty(
  command: string,
  args: string[],
): Promise<void> {
  return invoke("spawn_pty", { command, args });
}

export async function writePty(data: string): Promise<void> {
  return invoke("write_pty", { data });
}

export async function killPty(): Promise<void> {
  return invoke("kill_pty");
}

export interface InstallProgress {
  agent: string;
  status: string;
  message: string;
}

export function onInstallProgress(
  callback: (progress: InstallProgress) => void,
) {
  return listen<InstallProgress>("install-progress", (event) =>
    callback(event.payload),
  );
}

export function onPtyOutput(callback: (data: string) => void) {
  return listen<{ data: string }>("pty-output", (event) =>
    callback(event.payload.data),
  );
}

export function onPtyExit(callback: () => void) {
  return listen("pty-exit", () => callback());
}
