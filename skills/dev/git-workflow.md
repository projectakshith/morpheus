---
name: git-workflow
category: dev
description: Conventions for branching, atomic commits, and clean git history
triggers: ["commit", "git", "branch", "pr", "stash"]
---

# Git Workflow Skill

## Commit Conventions
- Use conventional commits format: `<type>: <description>`
- Types: `fix:`, `feat:`, `refactor:`, `test:`, `docs:`, `chore:`
- Description: lowercase, imperative verb, no trailing period.
  - Good: `fix: layout jitter`
  - Bad: `Fixed the bug where layout was jittering on every keystroke.`

## Safety Checklist Before Committing
1. Run `git status --short` to see all changed/untracked files.
2. Run test suites (`npm test` / `pytest`) to verify all tests pass.
3. Review changes with `git diff` to make sure debug logs or secrets are not committed.
