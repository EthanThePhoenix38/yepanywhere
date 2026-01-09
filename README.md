# Yep Anywhere

Yep, you can keep working anywhere.

A polished web interface for managing Claude and Codex agents. Works great on mobile and desktop — walk away from your desk, watch your kids, and keep your agents productive from your phone.

## What is this?

If you use Claude Code from the terminal, this gives you a better interface. Auto-detects your installed CLI tools and provides:

- **Interop first** — View sessions running in Claude CLI, VS Code, or other tools in real time, or resume them later from your phone. No new database — just a tiny JSON cache and optional metadata for starring/archiving
- **Multi-session dashboard** — See all your agents at a glance, easy multitasking
- **Mobile-friendly** — Approve requests, upload files, share screenshots from your phone
- **Push notifications** — Get notified when approval is needed (VAPID, no third-party server)
- **Voice input** — Talk to your agents via browser speech API (great for Linux where SuperWhisper isn't available)
- **Real-time streaming** — Watch agents work with sub-agent visibility
- **Read-only mode** — Observe CLI sessions in the UI while working in terminal elsewhere
- **Resource efficient** — Worker/supervisor pattern, doesn't spawn a CLI per task
- **Server-owned processes** — Client disconnects don't interrupt work

No database, no cloud, no accounts, no hidden gimmicks. 100% open source. Piggybacks on CLI tools' built-in persistence.

## Supported Providers

| Provider | Edit Visibility | Local Models | Approval Flow | Notes |
|----------|-----------------|--------------|---------------|-------|
| Claude Code | Full | No | Yes (per-tool) | Primary provider, full mobile supervision |
| Codex | Black box | No | In-chat only | Can't see what edits are happening |
| Codex-OSS | Full | Yes | No | Local models struggle with 6k system prompt |
| Gemini | N/A (read-only) | No | N/A | Analysis only, no write tools |
| OpenCode | ? | ? | ? | Early integration, approvals not implemented |

## Screenshots

<p align="center">
  <img src="site/screenshots/session-view.png" width="250" alt="Session view">
  <img src="site/screenshots/conversation.png" width="250" alt="Conversation">
  <img src="site/screenshots/approval.png" width="250" alt="Approval flow">
</p>
<p align="center">
  <img src="site/screenshots/navigation.png" width="250" alt="Navigation">
  <img src="site/screenshots/new-session.png" width="250" alt="New session">
  <img src="site/screenshots/response.png" width="250" alt="Response">
</p>

## Getting Started

If you can install Claude CLI, you can install this. Minimal dependencies.

```
npm i -g yepanywhere
yepanywhere
```

Or, from source:
```bash
git clone https://github.com/kzahel/yepanywhere.git
cd yepanywhere
pnpm install
pnpm start
```


Open http://localhost:3400 in your browser. The app auto-detects installed CLI agents.

## Remote Access

For accessing from your phone or another device, bring your own SSL termination (Caddy or Tailscale work well). Enable cookie authentication from the in-app settings page.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, configuration options, and more.

## Why not just use the terminal?

- Fixed-width fonts are hard to read for long text
- No file upload, screenshots, or image sharing
- No voice input
- No multi-session overview
- This gives you Claude.ai polish, but self-hosted and editing your code

## License

MIT
