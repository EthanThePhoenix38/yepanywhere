# Competitive Landscape

Analysis of similar tools in the AI coding agent supervisor space.

**[Feature Matrix](feature-matrix.md)** — Full checklist comparison across all tools.

## First-Party Tools

Official apps from AI providers:

| Tool | Type | Key Differentiator |
|------|------|-------------------|
| [Codex App](codex-app.md) | macOS + cloud | Cloud sandboxes, automations, GitHub integration |
| [Claude Code Desktop](claude-code-desktop.md) | Desktop (Electron) | Remote execution, Cowork for non-coders |

## Third-Party Tools

| Tool | Type | Agents | Key Differentiator |
|------|------|--------|-------------------|
| [emdash](emdash.md) | Desktop app | 20+ | Multi-agent orchestration, git worktrees |
| [Conductor](conductor.md) | macOS app | Claude, Codex | Git worktree isolation |
| [HAPI](hapi.md) | Web + CLI | Claude, Codex, Gemini, OpenCode | CLI-wrapper architecture, terminal page |
| [Happy](happy.md) | Mobile + CLI | Claude | Voice commands, native mobile apps |

See also [Community Projects](community-projects.md) for smaller tools shared on Reddit/forums.

## Common Features Across Competitors

Most tools in this space provide:
- Multi-session dashboard
- Real-time streaming
- Permission approval UI
- Session persistence

## yepanywhere Differentiators

Features we have that competitors lack:
- **Tiered inbox** (Needs Attention → Active → Recent → Unread)
- **Conversation fork/clone** from any message point
- **Global activity stream** across sessions
- **Real-time context usage** tracking
- **Bulk operations** (multi-select archive/star/delete)
- **Draft persistence** (auto-save messages)
- **Server-owned processes** (survives client disconnects)
- **E2E encryption + relay** for remote access (Happy also has this)

## Common Gaps

Features competitors have that we should consider:
- **Git worktree creation** per session (emdash, Conductor, HAPI)
- **Working tree diff viewer** (most competitors)
- **Diff commenting** (Claude Desktop)
- **Scheduling/automations** (Codex App)

## Last Updated

2026-02-03
