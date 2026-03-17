---
name: off
description: Disable the Glimpse companion daemon for Claude Code and report current status. Use when the user asks to turn the companion off.
disable-model-invocation: true
allowed-tools: Bash(node *)
---
Disable the Claude Code Glimpse companion.

Run these commands exactly:

```bash
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" off
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" status
```

Then summarize whether the companion is disabled and whether the daemon has stopped.
