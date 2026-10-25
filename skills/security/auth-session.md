---
name: auth-session
category: security
description: Review login, session, and route-guard behavior
triggers: ["authentication bypass", "session cookie", "jwt", "route guard", "login flow"]
---

# Auth and Session

## Objective
Determine whether authentication and session state are enforced on the server.

## Inputs
In-scope host, optional low-privilege account supplied by the operator.

## Method
1. Request a protected route without cookies; expect 401 or a login redirect.
2. Inspect cookie flags: `HttpOnly`, `Secure`, `SameSite`, and scope.
3. Decode any JWT header and payload. Check algorithm, expiry, and role claims.
4. Test whether a client-side guard can be bypassed by calling the API directly; do not modify local storage without operator approval.
5. Check whether password and profile updates require the current password.

## Signal
- A protected API returning data with no cookie.
- A JWT that trusts a client-supplied role without a server check.
- A password change accepted without the current password.

## Stop
Two accounts maximum. No credential stuffing, no password spraying, no token forgery.

## Output
`record_finding` for each missing server-side check. Return the route, expected guard, observed behavior, and evidence pointer.
