---
name: docker
category: devops
description: Writing minimal, secure, multi-stage Dockerfiles and compose setups
triggers: ["docker", "dockerfile", "container", "compose", "image"]
---

# Docker Skill

## Best Practices
1. **Multi-Stage Builds**: Separate build-time dependencies (compilers, devDependencies) from runtime images (distroless or alpine).
2. **Layer Caching**: Copy lockfiles (`package.json`, `package-lock.json`, `requirements.txt`) and install dependencies *before* copying application source code.
3. **Non-Root User**: Never run the production container as `root`. Specify `USER node` or create an unprivileged user.
4. **Clean `.dockerignore`**: Always exclude `.git`, `node_modules`, `.env*`, and build caches.
