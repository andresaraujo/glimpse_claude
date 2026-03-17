---
name: uninstall
description: Uninstall the Glimpse companion for Claude Code by disabling the daemon, removing the plugin-managed status line, restoring any backed up Claude Code status line configuration, and reporting the resulting status. Use when the user asks to uninstall or remove the Glimpse Claude Code companion.
disable-model-invocation: true
allowed-tools: Bash(node *)
---
Uninstall the Claude Code Glimpse companion.

Run these commands exactly, in order:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" uninstall
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" status
```

Then summarize:
- whether the companion is disabled
- whether the plugin-managed status line was removed
- whether a previous Claude Code status line was restored
- any remaining manual cleanup step if needed
