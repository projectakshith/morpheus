---
name: path-discovery
category: security
description: Find guardless application and API paths with a bounded wordlist
triggers: ["path discovery", "directory brute force", "gobuster", "ffuf", "hidden endpoint"]
---

# Path Discovery

## Objective
Find paths that do not enforce the same access checks as the visible application.

## Inputs
In-scope host, optional custom wordlist.

## Method
1. Start from the built-in list: `/admin`, `/api`, `/api/v1`, `/api/v2`, `/uploads`, `/backup`, `/debug`, `/actuator`, `/swagger`, `/.well-known`.
2. Send HEAD first; retry with GET only when HEAD returns 405.
3. Classify: 200, 204, 301, 302, 401, 403 are interesting; 404 and 400 are not.
4. Compare response length for 403 routes against a known 404 baseline; a large difference can mean a soft 403.
5. Follow at most one redirect hop, and only inside scope.

## Signal
- 200 without a session cookie.
- 401 on the parent path but 200 on a child.
- Spring Actuator, Swagger, or GraphQL introspection reachable.

## Stop
Two hundred paths per pass. Concurrency four. No recursive expansion in the same pass.

## Output
`record_finding` for each guardless path. Return status, byte length, and whether a session was required.
