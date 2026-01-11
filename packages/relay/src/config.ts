import { homedir } from "node:os";
import { join } from "node:path";

export interface RelayConfig {
  /** Port for the relay server (default: 3500) */
  port: number;
  /** Data directory for SQLite database (default: ~/.yep-relay/) */
  dataDir: string;
  /** Log level (default: info) */
  logLevel: string;
  /** Ping interval for waiting connections in ms (default: 60000) */
  pingIntervalMs: number;
  /** Pong timeout in ms - drop connection if no pong (default: 30000) */
  pongTimeoutMs: number;
  /** Days of inactivity before username can be reclaimed (default: 90) */
  reclaimDays: number;
}

function getEnvNumber(name: string, defaultValue: number): number {
  const value = process.env[name];
  if (value === undefined) return defaultValue;
  const parsed = Number.parseInt(value, 10);
  return Number.isNaN(parsed) ? defaultValue : parsed;
}

export function loadConfig(): RelayConfig {
  return {
    port: getEnvNumber("RELAY_PORT", 3500),
    dataDir: process.env.RELAY_DATA_DIR ?? join(homedir(), ".yep-relay"),
    logLevel: process.env.RELAY_LOG_LEVEL ?? "info",
    pingIntervalMs: getEnvNumber("RELAY_PING_INTERVAL_MS", 60_000),
    pongTimeoutMs: getEnvNumber("RELAY_PONG_TIMEOUT_MS", 30_000),
    reclaimDays: getEnvNumber("RELAY_RECLAIM_DAYS", 90),
  };
}
