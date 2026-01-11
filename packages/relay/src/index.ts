import { serve } from "@hono/node-server";
import { createNodeWebSocket } from "@hono/node-ws";
import { Hono } from "hono";
import { cors } from "hono/cors";
import pino from "pino";
import { loadConfig } from "./config.js";
import { ConnectionManager } from "./connections.js";
import { createDb } from "./db.js";
import { UsernameRegistry } from "./registry.js";
import { createWsHandler } from "./ws-handler.js";

const config = loadConfig();

// Initialize logger
const logger = pino({
  level: config.logLevel,
  transport: {
    target: "pino-pretty",
    options: {
      colorize: true,
    },
  },
});

logger.info(
  { dataDir: config.dataDir, port: config.port },
  "Starting relay server",
);

// Initialize database and registry
const db = createDb(config.dataDir);
const registry = new UsernameRegistry(db);

// Run reclamation on startup
const reclaimed = registry.reclaimInactive(config.reclaimDays);
if (reclaimed > 0) {
  logger.info({ count: reclaimed }, "Reclaimed inactive usernames");
}

// Create connection manager
const connectionManager = new ConnectionManager(registry);

// Create Hono app
const app = new Hono();

// Add CORS for browser clients
app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

// Health check endpoint
app.get("/health", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    waiting: connectionManager.getWaitingCount(),
    pairs: connectionManager.getPairCount(),
  });
});

// Status endpoint with more details
app.get("/status", (c) => {
  return c.json({
    status: "ok",
    uptime: process.uptime(),
    waiting: connectionManager.getWaitingCount(),
    pairs: connectionManager.getPairCount(),
    waitingUsernames: connectionManager.getWaitingUsernames(),
    registeredUsernames: registry.list().map((r) => r.username),
    memory: process.memoryUsage(),
  });
});

// Create WebSocket handler
const wsHandler = createWsHandler(connectionManager, config, logger);

// Create WebSocket support
const { upgradeWebSocket } = createNodeWebSocket({ app });

// WebSocket endpoint
app.get(
  "/ws",
  upgradeWebSocket(() => ({
    onOpen(event, ws) {
      wsHandler.onOpen(ws);
    },
    onMessage(event, ws) {
      wsHandler.onMessage(ws, event.data);
    },
    onClose(event, ws) {
      wsHandler.onClose(ws);
    },
    onError(event, ws) {
      wsHandler.onError(ws, event);
    },
  })),
);

// Start server
const server = serve(
  {
    fetch: app.fetch,
    port: config.port,
  },
  (info) => {
    logger.info(
      { port: info.port },
      `Relay server listening on http://localhost:${info.port}`,
    );
    logger.info(`WebSocket endpoint: ws://localhost:${info.port}/ws`);
  },
);

// Graceful shutdown
function shutdown() {
  logger.info("Shutting down relay server...");
  db.close();
  server.close(() => {
    logger.info("Relay server stopped");
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
