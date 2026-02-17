# Browser Control

You have access to a headless Chromium browser via the `browser` CLI. Use it to automate web tasks — checking websites, filling forms, extracting information, etc.

## Setup

The browser server must be running. Start it in the background if it isn't already:

```bash
tsx browser-control/src/server.ts &
```

Check if it's up:

```bash
tsx browser-control/src/cli.ts status
```

## CLI Reference

All commands are invoked as `tsx browser-control/src/cli.ts <command> [args...]`.

### Lifecycle
```bash
tsx browser-control/src/cli.ts start       # Start Chrome (auto-starts on first use)
tsx browser-control/src/cli.ts stop        # Stop Chrome
tsx browser-control/src/cli.ts status      # Check status
```

### Navigation
```bash
tsx browser-control/src/cli.ts open https://example.com           # Open URL in new tab
tsx browser-control/src/cli.ts navigate https://example.com       # Navigate current tab
tsx browser-control/src/cli.ts tabs                                # List open tabs
tsx browser-control/src/cli.ts close [targetId]                    # Close tab
```

### Reading Pages (Perception)
```bash
tsx browser-control/src/cli.ts snapshot                  # Get full accessibility snapshot
tsx browser-control/src/cli.ts snapshot --efficient       # Shorter snapshot (~12k chars, cheaper)
tsx browser-control/src/cli.ts snapshot --selector "main" # Scope to CSS selector
tsx browser-control/src/cli.ts screenshot                # Take screenshot (returns file path)
tsx browser-control/src/cli.ts screenshot --full          # Full page scroll capture
tsx browser-control/src/cli.ts console                   # View console.log messages
```

### Interacting with Elements
```bash
tsx browser-control/src/cli.ts click e5                    # Click element by ref
tsx browser-control/src/cli.ts type e5 Hello world         # Type text into element
tsx browser-control/src/cli.ts press Enter                  # Press keyboard key
tsx browser-control/src/cli.ts hover e5                     # Hover over element
tsx browser-control/src/cli.ts fill e3=John e4=john@x.com  # Fill multiple form fields
tsx browser-control/src/cli.ts select e7 option1 option2   # Select dropdown values
tsx browser-control/src/cli.ts evaluate document.title     # Run JavaScript
```

## Understanding Snapshots

The `snapshot` command returns an accessibility tree with element references. Example:

```
[url: https://library.example.com/account]
- heading "My Account" [level=1]
- navigation "Main"
  - link "Home" [ref=e1]
  - link "Catalog" [ref=e2]
  - link "My Account" [ref=e3]
- main
  - heading "Items Checked Out" [level=2]
  - table
    - row
      - cell "The Great Gatsby"
      - cell "Due: Feb 28, 2026"
      - cell
        - link "Renew" [ref=e12]
    - row
      - cell "1984"
      - cell "Due: Mar 5, 2026"
      - cell
        - link "Renew" [ref=e13]
  - textbox "Search catalog" [ref=e15]
  - button "Search" [ref=e16]
```

Element refs like `e5`, `e12` are how you reference elements in click/type/fill commands. They are assigned by Playwright's snapshot engine and change between snapshots.

## Workflow Pattern

Always follow this loop:

1. **Snapshot** to see the current page state
2. **Identify** the element ref you need to interact with
3. **Act** (click, type, fill, etc.) using the ref
4. **Snapshot again** to verify the action worked

Example:
```bash
tsx browser-control/src/cli.ts open https://library.example.com
tsx browser-control/src/cli.ts snapshot --efficient          # See the page
tsx browser-control/src/cli.ts click e3                       # Click "My Account"
tsx browser-control/src/cli.ts snapshot --efficient          # Verify navigation
tsx browser-control/src/cli.ts type e8 myusername             # Fill login
tsx browser-control/src/cli.ts type e9 mypassword
tsx browser-control/src/cli.ts click e10                      # Click "Log In"
tsx browser-control/src/cli.ts snapshot --efficient          # See account page
```

## Best Practices

- **Prefer snapshot over screenshot.** Snapshots are text (~3-5K tokens with --efficient). Screenshots are images (~1-3K tokens each but require vision). Use snapshots for 90% of interactions.
- **Use --efficient for routine navigation.** Only use full snapshots when you need to see everything on a complex page.
- **Use --selector to scope large pages.** If the snapshot is truncated, target the relevant section: `snapshot --selector "main"` or `snapshot --selector "#content"`.
- **Refs change between snapshots.** Always re-snapshot after an action to get fresh refs before the next action.
- **Use screenshot as fallback.** When the snapshot doesn't give enough context (visual layouts, images, CAPTCHAs), take a screenshot.
- **Check console for errors.** If something isn't working, run `console` to see JavaScript errors.
- **The browser persists.** Login sessions, cookies, and history survive across CLI invocations and even server restarts (user data is stored in ~/.browser-control/user-data/).
- **Close the initial about:blank tab.** When Chrome starts, it opens an about:blank tab. If you don't close it, commands without `--tab` will target it instead of your actual page. After opening your first URL, close the blank tab: `close <targetId>` (get the targetId from `tabs`).
- **Use `open` for new pages.** `open <url>` creates a new tab and navigates to it. Use `navigate <url>` to change the current tab's URL.
