# Glimpse for Claude Code

A shareable Claude Code plugin that shows a floating Glimpse companion near the cursor. It uses Claude Code hooks for activity updates, a status line bridge for context percentage, and a local Glimpse daemon to render multi-session and subagent activity.

## Current v1 behavior

- Shows activity states like `working`, `reading`, `editing`, `running`, `searching`, `done`, and `error`
- Tracks multiple sessions
- Shows subagents as nested rows while active
- Uses context percentage from Claude Code's status line JSON
- Uses Claude skills as the main control surface

## Limitations

- macOS only
- Requires `glimpseui` to be installed and resolvable from Node (`npm install -g glimpseui`)
- Uses an approximate `working` state instead of exact streaming/thinking detection
- Installs a status line command in `~/.claude/settings.json` to feed context metadata into the companion

## Local testing

Run Claude Code with the plugin loaded locally:

```bash
claude --plugin-dir .
```

Then use the plugin skills:

- `/glimpse:install`
- `/glimpse:on`
- `/glimpse:off`
- `/glimpse:status`
- `/glimpse:uninstall`

## Files

- `.claude-plugin/plugin.json` — plugin manifest
- `hooks/hooks.json` — Claude Code hook registrations
- `skills/` — install/on/off/status/uninstall skills
- `scripts/companion-daemon.mjs` — floating UI daemon
- `scripts/dispatch.mjs` — hook/status line bridge
- `scripts/control.mjs` — install/on/off/status control entrypoint

## Credits / Inspiration

This Claude Code plugin was inspired by the original pi-based Glimpse companion implementation by HazAT.

Reference source files:
- pi extension entrypoint: <https://github.com/HazAT/glimpse/blob/main/pi-extension/index.ts>
- pi companion window implementation: <https://github.com/HazAT/glimpse/blob/main/pi-extension/companion.mjs>

This project adapts that general idea to Claude Code using Claude Code hooks, skills, and a status line bridge instead of pi's in-process extension API.
