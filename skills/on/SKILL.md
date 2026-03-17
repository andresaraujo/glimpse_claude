---
name: on
description: Enable the Glimpse companion daemon for Claude Code and report current status. Use when the user asks to turn the companion on.
disable-model-invocation: true
allowed-tools: Bash(node *)
---
Enable the Claude Code Glimpse companion.

Run these commands exactly:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" on
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" status
```

Then summarize whether the companion is enabled and whether the daemon is reachable.
