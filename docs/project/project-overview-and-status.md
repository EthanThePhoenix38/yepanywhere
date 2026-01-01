# Claude Anywhere: Project Overview & Status

A mobile-first supervisor for Claude Code agents. Run agents on your dev machine, approve from your phone.

> For original vision documents and detailed design rationale, see `docs/archive/`.

## What It Is

Like the VS Code Claude extension, but:
- **Mobile-first** — Touch-friendly UI, push notifications, works on phones
- **Multi-session** — See all projects at a glance, no window cycling
- **Server-owned** — Disconnect and reconnect without losing state

## Current State

### Working Features

**Core Loop**
- Server spawns and manages Claude Code SDK processes
- Real-time SSE streaming of agent messages to clients
- Message queuing while Claude is working
- Tool approval UI with approve/deny actions
- Permission modes: default, acceptEdits, plan, bypassPermissions

**Session Management**
- Multi-project dashboard showing all sessions
- Session persistence via SDK's jsonl files
- Resume sessions after process restart
- Detect external sessions (CLI, VS Code) as read-only
- Custom session titles and archive status

**Mobile Experience**
- PWA with installable web app support
- Push notifications for approval requests (VAPID, no Firebase)
- Approve/deny from lock screen
- SSE auto-reconnect with resume

**Agent Features**
- Subagent (Task tool) tracking with status display
- Model selection and extended thinking support
- File uploads via WebSocket
- Plan mode with approval workflow

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Client (React PWA)                                         │
│  - SessionPage: real-time message display + tool approval   │
│  - Dashboard: multi-project session list                    │
│  - Push notification service worker                         │
└─────────────────────────┬───────────────────────────────────┘
                          │ SSE (streaming) + REST (actions)
┌─────────────────────────▼───────────────────────────────────┐
│  Server (Hono)                                              │
│  - Supervisor: manages process pool with worker queue       │
│  - Process: wraps Claude SDK, handles approvals/queue       │
│  - SessionReader: merges jsonl + SSE via DAG                │
│  - PushNotifier: VAPID web push                             │
└─────────────────────────┬───────────────────────────────────┘
                          │ Claude Code SDK
┌─────────────────────────▼───────────────────────────────────┐
│  Claude Code CLI                                            │
│  - Runs in ~/.claude/projects/{projectId}/                  │
│  - Persists to session jsonl files                          │
└─────────────────────────────────────────────────────────────┘
```

### Known Gaps

| Area | Status | Notes |
|------|--------|-------|
| Subagent message reload | Partial | SSE works; jsonl reload doesn't include subagent files yet |
| Multi-device push | Basic | Works, may need stale subscription cleanup |
| Process recovery | By design | Server restart halts processes; resume on next message |

## Tech Stack

- **Server**: Node.js, Hono, @anthropic-ai/claude-code SDK
- **Client**: React, Vite, React Router
- **Push**: web-push (VAPID protocol)
- **Linting**: Biome
- **Testing**: Vitest

## Project Structure

```
packages/
├── server/     # Hono backend
│   ├── supervisor/   # Process lifecycle (Supervisor, Process, WorkerQueue)
│   ├── routes/       # API endpoints
│   ├── sessions/     # Session file reading
│   └── push/         # Web push notifications
├── client/     # React frontend
│   ├── pages/        # SessionPage, NewSessionPage, etc.
│   ├── components/   # MessageInput, MessageList, ToolApprovalPanel
│   └── hooks/        # useSession, useSSE, usePushNotifications
└── shared/     # Shared types
```

## Competitive Position

| Tool | Multi-session | Desktop | Mobile | Push Notifications | Zero External Deps |
|------|---------------|---------|--------|-------------------|-------------------|
| Claude Code CLI | No | Yes | No | No | Yes |
| VS Code Extension | No | Yes | Partial* | No | Yes |
| **claude-anywhere** | Yes | Yes | Yes | Yes | Yes |

*VS Code Remote works but webview state is fragile.

## Future Directions

- Native installer (bundle Node.js, auto-generate VAPID keys)
- OAuth pairing flow for new devices
- Tailscale ACL integration
- Session search and filtering
