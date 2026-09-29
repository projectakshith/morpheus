---
name: cli-scripts
category: automation
description: Writing portable, robust Bash, Zsh, and Node scripts
triggers: ["script", "bash script", "zsh", "shell script", "automate", "cron"]
---

# CLI Scripts Skill

## Robust Shell Scripting Rules
1. **Safety Flags**: Always start non-trivial Bash/Zsh scripts with:
   ```bash
   set -euo pipefail
   IFS=$'\n\t'
   ```
2. **Path Portability**: Avoid hardcoding absolute paths. Resolve relative to the script's directory:
   ```bash
   SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
   ```
3. **Check Dependencies**: Validate that required binaries exist before executing:
   ```bash
   command -v jq >/dev/null 2>&1 || { echo >&2 "Error: jq is required but not installed."; exit 1; }
   ```
4. **Clean Exit Traps**: Use `trap cleanup EXIT` to remove temporary files or kill background processes on termination.
