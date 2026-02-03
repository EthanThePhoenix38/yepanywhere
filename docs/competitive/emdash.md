# emdash

**Website:** https://www.emdash.sh/
**Type:** Desktop application (open source, free)
**Repository:** GitHub (open source)

## Overview

Desktop application for orchestrating multiple AI coding agents in parallel. Positions itself as "your coding agent dashboard."

## Key Features

| Feature | Details |
|---------|---------|
| **Multi-agent support** | 20+ agents: Claude Code, Codex, Cursor, GitHub Copilot, Amp, etc. |
| **Git worktree isolation** | Each task runs in isolated worktree automatically |
| **Parallel execution** | Run competing agents on same task, compare results |
| **Built-in diff review** | Integrated code editing, diff review, commit management |
| **Kanban view** | Task board for tracking agent progress |
| **CLI auto-detection** | Automatically finds installed agent CLIs |
| **MCP integration** | Model Context Protocol support |

## Architecture

- Desktop app (Electron presumably)
- Each agent task gets its own git worktree
- Kanban-style task management
- Local-only, no cloud dependencies

## Comparison to yepanywhere

### emdash has that we don't
- Multi-agent support (20+ vs our 3-4)
- Git worktree per task
- Kanban task tracking
- Compare outputs across agents
- Built-in diff review UI

### We have that emdash doesn't
- Server-owned processes (survives disconnects)
- Push notifications
- Tiered inbox system
- Conversation fork/clone
- Global activity stream
- Context usage tracking
- Bulk operations

## Target User

Desktop power users who want to run multiple different agents in parallel and compare their work.

## Last Updated

2026-02-03
