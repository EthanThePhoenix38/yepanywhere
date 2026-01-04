# Yep Anywhere

Yep, you can keep working anywhere.

A polished web interface for managing Claude and Codex agents. Works great on mobile and desktop — walk away from your desk, watch your kids, and keep your agents productive from your phone.

## What is this?

If you use Claude Code or Codex from the terminal, this gives you a better interface. Auto-detects your installed CLI tools and provides:

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

| Provider | Status |
|----------|--------|
| Claude Code | Full support |
| Codex | Full support (including local models) |
| Gemini | Limited — their CLI doesn't support streaming stdin |

## Screenshots

Coming soon.

## Getting Started

If you can install Claude CLI, you can install this.

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
