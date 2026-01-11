# Relay Server Implementation Plan

## Overview

A relay server that enables phone clients to connect to yepanywhere servers behind NAT. The relay is a "dumb pipe" that matches clients to servers and forwards encrypted messages without inspection.

## Architecture

```
Yepanywhere Server                     Relay                          Phone
      |                                  |
      | == WS (waiting) ===============> |
      |                                  | <==== Phone connects
      |    (claimed!)                    |
      | <================================+==============================> |
      |         (now a 1:1 pipe)         |
      |                                  |
      | == WS (waiting) ===============> |  <- immediately open new one
```

- Each phone gets a dedicated server connection (no multiplexing)
- When connection is claimed, yepanywhere opens a new waiting connection
- Relay maintains exactly one waiting connection per username

## Protocol

```typescript
// Server -> Relay
{ type: "server_register", username: string, installId: string }
{ type: "server_registered" } | { type: "server_rejected", reason: string }

// Phone -> Relay
{ type: "client_connect", username: string }
{ type: "client_connected" } | { type: "client_error", reason: "server_offline" | "unknown" }

// After pairing: pure passthrough (relay doesn't inspect messages)
```

## Implementation Phases

### Phase 1: Shared Types

**File: `packages/shared/src/relay-protocol.ts`** (new)

```typescript
// Server registration
export interface RelayServerRegister {
  type: "server_register";
  username: string;
  installId: string;
}

export interface RelayServerRegistered {
  type: "server_registered";
}

export interface RelayServerRejected {
  type: "server_rejected";
  reason: "username_taken" | "invalid_username" | "rate_limited";
}

// Client connection
export interface RelayClientConnect {
  type: "client_connect";
  username: string;
}

export interface RelayClientConnected {
  type: "client_connected";
}

export interface RelayClientError {
  type: "client_error";
  reason: "server_offline" | "unknown_username" | "rate_limited";
}

// Type guards for each message type
```

**File: `packages/shared/src/index.ts`** - Export new types

---

### Phase 2: Relay Package

**Directory: `packages/relay/`**

```
packages/relay/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts              # Hono server entry
│   ├── config.ts             # Environment config (PORT, DATA_DIR)
│   ├── registry.ts           # UsernameRegistry - JSON persistence
│   ├── connections.ts        # ConnectionManager - matching & forwarding
│   └── ws-handler.ts         # WebSocket route handler
```

**UsernameRegistry** (`registry.ts`):
- Stores `{ username -> { installId, registeredAt, lastSeenAt } }`
- Persists to `{dataDir}/registry.json`
- `canRegister(username, installId)` - check if available or owned
- `register(username, installId)` - claim username
- `reclaimInactive(90 days)` - free stale usernames

**ConnectionManager** (`connections.ts`):
- `waiting: Map<username, WebSocket>` - one waiting connection per server
- `pairs: Map<WebSocket, WebSocket>` - bidirectional lookup for forwarding
- `registerServer(ws, username, installId)` - add to waiting pool
- `connectClient(ws, username)` - pair with waiting server, notify server to open new waiting
- `forward(ws, data)` - pipe to paired socket

**WebSocket Handler** (`ws-handler.ts`):
- Parse first message to determine server vs client
- Server: validate installId, add to waiting pool
- Client: find waiting server, create pair, enter passthrough mode
- Passthrough: forward all messages to paired socket

---

### Phase 3: InstallService (Yepanywhere)

**File: `packages/server/src/services/InstallService.ts`** (new)

```typescript
interface InstallState {
  version: number;
  installId: string;    // crypto.randomUUID()
  createdAt: string;
}

class InstallService {
  // Follows RemoteAccessService pattern
  // Generates installId on first run, persists to {dataDir}/install.json
  getInstallId(): string
}
```

**File: `packages/server/src/index.ts`** - Initialize and wire up

---

### Phase 4: RelayClientService (Yepanywhere)

**File: `packages/server/src/services/RelayClientService.ts`** (new)

```typescript
class RelayClientService {
  private controlWs: WebSocket | null;      // Registration connection
  private waitingWs: WebSocket | null;      // Current waiting connection

  // On startup (if remote access enabled):
  // 1. Connect to relay, send server_register
  // 2. On server_registered, open waiting connection

  // When waiting connection receives traffic (client paired):
  // 1. Hand off socket to ws-relay handler for SRP/encryption
  // 2. Open new waiting connection

  // Reconnection with exponential backoff
}
```

**Integration with ws-relay.ts**:
- Add method to accept pre-connected WebSocket from relay
- Reuse existing SRP auth, encryption, message routing logic

---

### Phase 5: Settings UI

**File: `packages/server/src/remote-access/RemoteAccessService.ts`**
- Add `relayUrl?: string` to state
- Add `getRelayUrl()` / `setRelayUrl()` methods
- Bump schema version, add migration

**File: `packages/server/src/remote-access/routes.ts`**
- `GET /api/remote-access/relay-url`
- `PUT /api/remote-access/relay-url`

**File: `packages/client/src/pages/SettingsPage.tsx`**
- Add relay URL input field when remote access is enabled
- Default placeholder: `wss://relay.yepanywhere.com/ws`

**File: `packages/client/src/hooks/useRemoteAccess.ts`**
- Add `relayUrl` to config type
- Add `updateRelayUrl()` method

---

### Phase 6: Testing

**Unit tests:**
- `packages/relay/test/registry.test.ts` - username claiming, reclamation
- `packages/relay/test/connections.test.ts` - pairing, forwarding
- `packages/server/test/services/InstallService.test.ts`

**E2E tests:**
- `packages/relay/test/e2e/relay.e2e.test.ts`
  - Server registration
  - Client connection to registered server
  - Message forwarding (passthrough)
  - Server offline error
  - Username taken rejection
  - Reconnection after disconnect

---

## Critical Files

| File | Action |
|------|--------|
| `packages/shared/src/relay-protocol.ts` | Create - protocol types |
| `packages/relay/` | Create - new package |
| `packages/server/src/services/InstallService.ts` | Create - install ID |
| `packages/server/src/services/RelayClientService.ts` | Create - relay client |
| `packages/server/src/remote-access/RemoteAccessService.ts` | Modify - add relayUrl |
| `packages/server/src/remote-access/routes.ts` | Modify - relay URL endpoints |
| `packages/server/src/routes/ws-relay.ts` | Modify - accept relay connections |
| `packages/server/src/index.ts` | Modify - wire up services |
| `packages/client/src/pages/SettingsPage.tsx` | Modify - relay URL field |
| `packages/client/src/hooks/useRemoteAccess.ts` | Modify - relay URL hook |

## Configuration

**Relay server:**
- `RELAY_PORT` (default: 3500)
- `RELAY_DATA_DIR` (default: `~/.yep-relay/`)
- `RELAY_LOG_LEVEL` (default: info)

**Yepanywhere server:**
- Relay URL stored in `remote-access.json`
- Install ID stored in `install.json`

## Design Decisions

- **Self-hosted relay** in monorepo as `packages/relay`
- **Consistent stack** - Hono + Node.js (same as yepanywhere)
- **No complex auth** - installId is weak secret for username claiming
- **First-come-first-served** usernames with 90-day reclamation
- **Username format** - `^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$` (3-32 chars)
- **Offline detection** - Client-side timeout (~20s), relay returns `server_offline` immediately if no waiting connection
- **Custom relay URL** - Users can point to their own relay in settings

## Future: Multi-Relay Scaling

When needed, add a front-door service:
1. Yepanywhere connects to front-door, gets assigned to relay N
2. Phone queries front-door for username location, connects to relay N
3. Database tracks username -> relay mapping (sticky for efficiency)

This can be added later without changing the core relay protocol.

## Verification

1. Start relay: `cd packages/relay && pnpm dev`
2. Configure yepanywhere: Settings > Remote Access > Relay URL = `ws://localhost:3500/ws`
3. Enable remote access with username/password
4. Connect from remote client to relay with same username
5. Verify SRP auth completes and app works through relay

Run tests:
```bash
pnpm --filter @yep-anywhere/relay test
pnpm --filter @yep-anywhere/server test
pnpm test:e2e
```
