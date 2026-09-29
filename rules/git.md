---
name: git
description: Git commit and repository hygiene rules
---

# Git Rules

1. **Commit Messages**: Ultra-short phrases only (2-4 words max, e.g. `action labels`, `pin header`, `fix wrapping`). NEVER write full sentences or long descriptions.
2. **No Novels**: Never write multi-line essay commit messages unless explicitly requested by the user.
3. **Inspect Before Commit**: Always run `git status --short` and `git diff` before staging changes.
4. **Atomic Commits**: Group related changes only. One logical fix or feature per commit.
