# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.3] - 2025-02-09

### Fixed
- Windows support: replace Unix `which` with `where` for CLI detection
- Windows support: accept Windows absolute paths (e.g. `C:\Users\...`) in project validation
- Windows support: fix path traversal guard and project directory encoding for backslash paths
- Windows support: use `os.homedir()` instead of `process.env.HOME` for tilde expansion
- Windows support: fix path separator handling in codex/gemini directory resolution
- Windows support: show PowerShell install command instead of curl/bash

## [0.2.2] - 2025-02-03

### Added
- Relay connection status bar
- Website release process with tag-based deployment

### Fixed
- Sibling tool branches in conversation tree

### Changed
- Simplify Claude, Codex, and Gemini auth to CLI detection only
- Update claude-agent-sdk to 0.2.29

## [0.2.1] - 2025-01-31

### Added
- CLI setup commands for headless auth configuration
- Relay `/online/:username` endpoint for status checks
- Multi-host support for remote access
- Switch host button to sidebar
- WebSocket keepalive ping/pong to RelayClientService
- Host offline modal and tool approval click protection
- Error boundary for graceful error handling
- Terminate option to session menu

### Fixed
- Host picker navigation and relay routes session resumption
- Relay login to set currentHostId before connecting
- DAG branch selection to prefer conversation over progress messages
- Session status event field name and auto-retry on dead process
- Sidebar overlay auto-close logic
- SRP auth hanging on unexpected messages
- Relay reconnection error messages for unreachable server
- Mobile reconnection showing stale session status
- Dual sidebar rendering on viewport resize
- Skip API calls on login page to prevent 401 popups
- Various relay host routing and disconnect handling fixes

### Changed
- Update claude-agent-sdk to 0.2.19
- Rename session status to ownership and clarify agent activity

## [0.1.10] - 2025-01-23

### Fixed
- Handle 401 auth errors in SSE connections
- Fix session stream reconnection on mobile wake
- Fix relay reconnection to actually reconnect WebSocket

### Added
- Connection diagnostics and detailed reconnect logging
- Show event stream connection status in session info modal
