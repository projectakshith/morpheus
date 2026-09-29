---
name: debugging
category: dev
description: Systematic root cause isolation and debugging workflow
triggers: ["debug", "bug", "error", "failing", "crash", "exception", "broken"]
---

# Debugging Skill

## 4-Step Root Cause Isolation
1. **Reproduce & Pin**: Run the failing test or command to observe the exact failure trace and line number.
2. **Isolate Scope**: Do NOT read the whole repository. Inspect only the file throwing the error and immediate callers.
3. **Minimal Surgical Fix**: Apply the smallest possible change that fixes the root cause without altering adjacent behaviors.
4. **Verify**: Re-run the test or command immediately to confirm the fix works and no regressions were introduced.

## Anti-Patterns
- Never make blind guesses or try random variations.
- Never add multiple speculative fixes at once.
- If stuck after 2 attempts, run a targeted test with debug logs to inspect runtime state.
