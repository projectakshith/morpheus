---
name: clean-code
description: Principles for writing modular, maintainable, and type-safe code
---

# Clean Code Rules

1. **Modularity**: Every module/function does one thing well. Keep functions small (< 40 lines).
2. **Type Safety**: Strictly type all inputs and outputs. Avoid `any` — use explicit unions, generics, or `unknown` with type guards.
3. **No Speculative Bloat**: Never add unused abstractions, helpers, or "just-in-case" features. Solve only the immediate problem.
4. **Preserve Integrity**: Never delete comments, docstrings, or tests unrelated to the task.
5. **Fail Fast**: Validate inputs at system boundaries. Return descriptive errors rather than silently swallowing exceptions.
