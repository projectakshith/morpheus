---
name: testing
category: dev
description: Writing reliable unit, integration, and regression tests
triggers: ["test", "tests", "unit test", "spec", "vitest", "jest", "coverage"]
---

# Testing Skill

## Guidelines
1. **Behavioral Assertions**: Test what the module does (inputs vs outputs), not internal implementation details.
2. **Deterministic & Fast**: Tests must run offline, without network calls, and complete in < 5 seconds.
3. **Edge Cases**: Always include tests for empty strings, null/undefined, out-of-bounds indices, and error throws.
4. **Colocated or `test/`**: Follow existing repository conventions (`test/*.test.ts` or `*.spec.ts`).
