---
name: status
description: Show the current Glimpse companion status for Claude Code, including whether it is enabled, whether the daemon is running, and whether the status line is installed. Use when the user asks for Glimpse companion status or troubleshooting.
disable-model-invocation: true
allowed-tools: Bash(node *)
---
Inspect the Claude Code Glimpse companion status.

Run this command exactly:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" status
```

Summarize:
- enabled state
- daemon state
- status line installation state
- likely next step if setup is incomplete

If setup is incomplete, explicitly recommend `/glimpse:install`.
Do not refer to a generic “setup skill”.
