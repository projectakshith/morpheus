---
name: js-intel
category: security
description: Mine client bundles for endpoints, roles, and embedded secrets
triggers: ["javascript bundle", "js intel", "bundle analysis", "endpoint mining", "client-side blueprint"]
---

# JavaScript Intel

## Objective
Recover the backend surface that the client already knows about.

## Inputs
In-scope host and the HTML entry points.

## Method
1. Collect script sources from the HTML, skipping known CDN libraries.
2. Fetch each bundle once; keep the first 5 MB.
3. Extract strings matching `/api/`, `/v1/`, `https?://`, and `baseUrl`.
4. Extract role, permission, and route-guard names.
5. Search for `password`, `secret`, `token`, `apikey`, `private_key`, and `backdoor`.
6. Look for client-side checks such as `role ===`, `isAdmin`, and `MasterKey`.

## Signal
- An endpoint that appears in a bundle but not in navigation.
- A role comparison used as the only guard for a route.
- A credential-shaped constant longer than 16 characters.

## Stop
Ten bundles. Never execute bundle code. Never download source maps unless the scope names them.

## Output
`record_finding` for exposed secrets or client-only authorization. Return the deduplicated endpoint list and role names.
