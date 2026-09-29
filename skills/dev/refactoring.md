---
name: refactoring
category: dev
description: Splitting large files and cleaning code without breaking public interfaces
triggers: ["refactor", "clean up", "split", "modularize", "reorganize"]
---

# Refactoring Skill

## Principles
1. **Contract Invariance**: Never alter public function signatures or exported types during a refactor unless requested.
2. **Stepwise Extraction**: Extract one helper/sub-component at a time. Run tests after each extraction.
3. **Colocation**: Keep closely coupled types, utilities, and tests near their consumers.
4. **Dead Code Purge**: Remove unused imports and unreferenced functions after extraction.
