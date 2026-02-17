# Browser Control

Headless Chromium automation server + CLI for Claude Code. Uses Playwright's accessibility snapshots for token-efficient browser interaction.

## Setup

```bash
cd browser-control
pnpm install --ignore-workspace
./node_modules/.bin/playwright install chromium
sudo ./node_modules/.bin/playwright install-deps chromium  # Linux system libraries
```

## Usage

Start the server (runs on port 3500):

```bash
npx tsx src/server.ts &
```

Use the CLI:

```bash
npx tsx src/cli.ts open https://example.com
npx tsx src/cli.ts snapshot --efficient
npx tsx src/cli.ts click e6
npx tsx src/cli.ts type e5 Hello world
npx tsx src/cli.ts screenshot
```

## CLI Commands

### Lifecycle
| Command | Description |
|---------|-------------|
| `status` | Check if browser is running |
| `start` | Start Chrome (auto-starts on first request) |
| `stop` | Stop Chrome |

### Navigation
| Command | Description |
|---------|-------------|
| `open <url>` | Open URL in new tab |
| `navigate <url>` | Navigate current tab to URL |
| `tabs` | List open tabs |
| `close [targetId]` | Close a tab |

### Reading Pages
| Command | Description |
|---------|-------------|
| `snapshot` | Get accessibility tree (~80K chars max) |
| `snapshot --efficient` | Shorter snapshot (~12K chars) |
| `snapshot --selector "main"` | Scope to CSS selector |
| `screenshot` | Take screenshot (returns file path) |
| `screenshot --full` | Full page scroll capture |
| `console` | View browser console messages |

### Interacting
| Command | Description |
|---------|-------------|
| `click <ref>` | Click element by ref |
| `type <ref> <text>` | Type text into element |
| `press <key>` | Press keyboard key (Enter, Tab, Escape) |
| `hover <ref>` | Hover over element |
| `fill <ref>=<val> ...` | Fill multiple form fields |
| `select <ref> <val> ...` | Select dropdown values |
| `evaluate <js>` | Run JavaScript in page |
| `pdf` | Save page as PDF |

## How Snapshots Work

The `snapshot` command returns an accessibility tree with element refs:

```
[url: https://example.com/]
- heading "Example Domain" [level=1] [ref=e3]
- paragraph [ref=e4]: This domain is for use in...
- link "Learn more" [ref=e6] [cursor=pointer]
```

Use the `ref` values (e.g. `e3`, `e6`) to interact with elements:

```bash
npx tsx src/cli.ts click e6      # Click the "Learn more" link
npx tsx src/cli.ts type e8 hello # Type into a text field
```

Refs are assigned by Playwright's snapshot engine and change between snapshots. Always re-snapshot after an action to get fresh refs.

## Architecture

```
CLI (cli.ts)  ──HTTP──>  Hono Server (server.ts + routes.ts)
                              │
                         Playwright (playwright.ts)
                              │
                         Chrome via CDP (chrome.ts)
```

- **server.ts** — Hono HTTP server on port 3500 (configurable via `BROWSER_PORT`)
- **routes.ts** — Route handlers mapping HTTP requests to Playwright calls
- **playwright.ts** — Playwright CDP connection, `_snapshotForAI()`, ref-based actions
- **chrome.ts** — Chrome process spawning and lifecycle management
- **cli.ts** — CLI wrapper that the agent invokes via Bash
- **types.ts** — Zod schemas for request validation

## Configuration

| Environment Variable | Default | Description |
|---------------------|---------|-------------|
| `BROWSER_PORT` | `3500` | Server port |
| `BROWSER_URL` | `http://127.0.0.1:3500` | Full server URL (overrides port) |
| `BROWSER_CONTROL_DATA_DIR` | `~/.browser-control` | Data directory for user profile, screenshots |

Browser user data (cookies, login sessions) persists in `~/.browser-control/user-data/` across restarts.

## Claude Code Skill

The companion skill prompt at `.claude/skills/browser.md` teaches Claude Code how to use the CLI, read snapshots, and follow the snapshot-act-verify workflow.
