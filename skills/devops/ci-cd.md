---
name: ci-cd
category: devops
description: Writing clean, fast GitHub Actions workflows and CI/CD pipelines
triggers: ["github actions", "ci", "cd", "workflow", "pipeline", "automation test"]
---

# CI/CD Workflows Skill

## GitHub Actions Standards
1. **Pin Action Versions**: Pin external actions by SHA or exact major version (`actions/checkout@v4`).
2. **Dependency Caching**: Use built-in cache features (`setup-node` with `cache: 'npm'`, `setup-python` with `cache: 'uv'`).
3. **Fail Fast & Concurrency**: Set `concurrency.cancel-in-progress: true` on PR branches to cancel obsolete runs.
4. **Minimal Matrix**: Test target LTS runtime versions first; run linters and fast unit tests before heavy integration suites.
