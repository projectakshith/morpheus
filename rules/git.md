---
name: git
description: Git commit and repository hygiene rules
---

# Git Rules

1. **Commit Messages**: Conventional prefixes (`feat:`, `fix:`, `refactor:`, `chore:`) followed by an ultra-short phrase (2-4 words max, e.g. `feat: action labels`, `fix: wrap calc`, `refactor: pinned header`). NEVER write full sentences after the prefix.
2. **No Novels**: Never write multi-line essay commit messages unless explicitly requested by the user.
3. **Inspect Before Commit**: Always run `git status --short` and `git diff` before staging changes.
4. **Atomic Commits**: Group related changes only. One logical fix or feature per commit.
