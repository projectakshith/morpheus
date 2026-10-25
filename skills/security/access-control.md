---
name: access-control
category: security
description: Test broken access control and insecure direct object references
triggers: ["idor", "access control", "privilege escalation", "object reference", "broken access"]
---

# Access Control

## Objective
Confirm whether objects and roles are reachable without the right authorization.

## Inputs
Endpoint inventory with id-bearing routes and optional sessions.

## Method
1. Request each object route as a guest and record status and byte length.
2. Request the same route with an id one higher and one lower; compare body hashes and owner fields.
3. Repeat with a low-privilege session when the operator supplied one.
4. For role parameters, compare the response with the declared role only; never write a new role.
5. Stop at the first two confirmed records.

## Signal
- Different bodies for two ids in the same collection.
- The same status and byte length for a guest and an authenticated user.
- A `role`, `tenant`, or `organization` field accepted from the request body.

## Stop
Two records. Read-only verbs only unless the scope allows writes. Never enumerate a full collection.

## Output
`record_finding` with endpoint, ids compared, observed difference, and evidence path.
