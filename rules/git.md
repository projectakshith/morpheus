---
name: git
description: Git commit and repository hygiene rules
---

# Git Rules

1. **Commit Messages**: Strictly lowercase imperative, concise format (e.g. `fix: layout jitter`, `feat: add glob tool`).
2. **No Novels**: Never write multi-line essay commit messages unless explicitly requested by the user.
3. **Inspect Before Commit**: Always run `git status --short` and `git diff` before staging changes.
4. **Atomic Commits**: Group related changes only. One logical fix or feature per commit.
