<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="site/branding/lockup-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="site/branding/lockup-light.svg">
    <img src="site/branding/lockup-light.svg" alt="Yep Anywhere" height="60">
  </picture>
</p>

<p align="center">
  <em>Yep, you can keep working anywhere.</em>
</p>

<p align="center">
  <a href="https://yepanywhere.com">yepanywhere.com</a>
</p>

A polished web interface for managing Claude and Codex agents. Works great on mobile and desktop — walk away from your desk, watch your kids, and keep your agents productive from your phone.

**Seamless handoff.** Work at your desk, walk away, continue exactly where you left off. No friction. Your agent keeps running on your dev machine while you supervise from the couch, the coffee shop, or the school pickup line.

**Your desk follows you.** Push notifications when approval is needed. Respond from your lock screen. Glance at progress between meetings. The server does the heavy lifting — your phone is just a window.

**Share files from anywhere.** Upload images, screenshots, documents, and code files directly from your phone. Snap a photo of a whiteboard sketch, share an error screenshot, or attach design mockups — your agent sees exactly what you see.

**Multi-session sanity.** Stop cycling through terminal tabs. See all your projects at once. Star the important ones, archive the finished ones. Context-switch without losing context.

## TOS Compliance

Yep Anywhere uses the official [`@anthropic-ai/claude-agent-sdk`](https://www.npmjs.com/package/@anthropic-ai/claude-agent-sdk) published by Anthropic. Unlike [third-party tools that were blocked](https://yepanywhere.com/tos-compliance.html) for spoofing client identity and circumventing pricing, we don't handle authentication, spoof headers, or manipulate OAuth tokens. You authenticate via your own Claude CLI — we're just a remote interface to your sessions.

Read more: [How we use the SDK](https://yepanywhere.com/tos-compliance.html) | [Feb 2026 auth clarification](https://yepanywhere.com/sdk-auth-clarification.html)

## What is this?

If you use Claude Code or Codex from the terminal, this gives you a better interface. Auto-detects your installed CLI tools and provides:

- **Interop first** — View sessions running in Claude CLI, VS Code, or other tools in real time, or resume them later from your phone. No new database — just a tiny JSON cache and optional metadata for starring/archiving
- **Multi-session dashboard** — See all your agents at a glance, easy multitasking
- **Mobile-friendly** — Approve requests, upload files, share screenshots and photos directly from your phone's camera roll
- **Push notifications** — Get notified when approval is needed (VAPID, no third-party server)
- **Voice input** — Talk to your agents via browser speech API (great for Linux where SuperWhisper isn't available)
- **Real-time streaming** — Watch agents work with sub-agent visibility
- **Read-only mode** — Observe CLI sessions in the UI while working in terminal elsewhere
- **Resource efficient** — Worker/supervisor pattern, doesn't spawn a CLI per task
- **Server-owned processes** — Client disconnects don't interrupt work
- **Fast on mobile** — Syntax highlighting and markdown rendering happen server-side, keeping the client lightweight

No database, no cloud, no accounts, no hidden gimmicks. 100% open source. Piggybacks on CLI tools' built-in persistence.

## Supported Providers

| Provider | Edit Visibility | Local Models | Approval Flow | Notes |
|----------|-----------------|--------------|---------------|-------|
| Claude Code | Full | No | Yes (per-tool) | Primary provider, full mobile supervision |
| Codex | Full | No | Yes (per-tool) | Full support — diffs, approvals, streaming |
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
  <img src="site/screenshots/mobile-diff.png" width="250" alt="Mobile diff view">
</p>

**Works great on desktop too!**

<p align="center">
  <img src="site/screenshots/desktop.png" width="400" alt="Desktop view">
  <img src="site/screenshots/desktop-diff.png" width="400" alt="Desktop diff view">
</p>

## Getting Started

If you can install Claude Code or Codex, you can install this. Minimal dependencies.

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

**Easiest:** Use our free public relay — configure it in Settings, or via CLI for headless setups:

```bash
yepanywhere --setup-remote-access --username myserver --password "secretpass123"
```

Then connect from anywhere at [yepanywhere.com/remote](https://yepanywhere.com/remote).

All traffic is end-to-end encrypted (SRP-6a + TweetNaCl) and we can't see your data. No accounts required.

> **Note:** If you run `--setup-remote-access` while the server is running, restart it to pick up the new config.

**Self-hosted:** Prefer to run your own infrastructure? Use Tailscale, Caddy, or any reverse proxy with SSL termination. See the [remote access docs](docs/project/remote-access.md) for details.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for build instructions, configuration options, and more.

## Why not just use the terminal?

- Fixed-width fonts are hard to read for long text
- **No file uploads** — can't share screenshots, photos, PDFs, or other files with your agent
- No voice input
- No multi-session overview
- This gives you a polished UI, but self-hosted and editing your code

## License

MIT
