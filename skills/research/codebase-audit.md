---
name: codebase-audit
category: research
description: Inspecting codebases for dead code, vulnerabilities, security leaks, and architecture bottlenecks
triggers: ["audit", "analyze codebase", "security review", "vulnerability", "dead code"]
---

# Codebase Audit Skill

## Systematic Audit Steps
1. **Dependency Health**: Check for deprecated or vulnerable packages (`npm audit`, `pip audit`).
2. **Secret Detection**: Scan for committed API keys, tokens, or private certs (`git log -S`, `.env` checks).
3. **Dead Code & Unused Exports**: Check for orphaned modules and unused exports.
4. **Error Handling Integrity**: Identify uncaught promise rejections, swallowed exceptions (`catch {}`), and missing input validation at boundaries.
