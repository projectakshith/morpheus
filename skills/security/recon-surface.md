---
name: recon-surface
category: security
description: Enumerate subdomains and live hosts for an authorized target
triggers: ["subdomain enumeration", "subdomain", "crt.sh", "host inventory", "recon surface"]
---

# Surface Recon

## Objective
Map every reachable host that belongs to the target before testing anything else.

## Inputs
Primary host from the engagement scope.

## Method
1. Query Certificate Transparency for `%.<host>` and collect unique names.
2. Drop wildcard entries and names outside the registered domain.
3. Resolve each candidate with DNS; keep hosts that answer.
4. Group by prefix: `api`, `admin`, `dev`, `test`, `eval`, `staging`.
5. Probe one GET per host and record status, server, and body length.

## Signal
- A `dev` or `test` mirror returning 200.
- An administrative prefix reachable without a redirect to login.
- A host that resolves but is absent from the main application navigation.

## Stop
Forty hosts per pass. No directory brute force in this phase.

## Output
`record_finding` for each host that widens the attack surface. Return a host table with status and server only.
