---
name: install
description: Install the Glimpse companion for Claude Code by wiring the status line, enabling the companion, and reporting the resulting status. Use when the user asks to install or set up the Glimpse Claude Code companion.
disable-model-invocation: true
allowed-tools: Bash(node *), Bash(/bin/bash *)
---
Install the Claude Code Glimpse companion using the bundled scripts.

Run these commands exactly, in order:

```bash
/bin/bash "${CLAUDE_SKILL_DIR}/../../scripts/install-statusline.sh"
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" on
node "${CLAUDE_SKILL_DIR}/../../scripts/control.mjs" status
```

Then summarize:
- whether the status line was installed
- whether the companion is enabled
- whether the daemon is running
- any follow-up manual step if something failed
