---
name: safety
description: Safety, security, and execution safeguards
---

# Safety Rules

1. **Non-Destructive Actions**: Never run destructive commands (`rm -rf`, `git reset --hard`, `git clean -f`) without explicit user consent.
2. **Secrets Protection**: Never log, echo, or write `.env` secrets, API keys, or private tokens into files or logs.
3. **Backup Check**: Before overwriting large existing files, verify git working tree status to ensure uncommitted work is not lost.
