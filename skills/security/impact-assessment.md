---
name: impact-assessment
category: security
description: Turn confirmed findings into a blast-radius statement
triggers: ["impact assessment", "blast radius", "pii exposure", "data exposure", "severity"]
---

# Impact Assessment

## Objective
State what an attacker gains, not just what failed.

## Inputs
Confirmed findings with evidence pointers.

## Method
1. For each finding, name the asset reached: records, funds, sessions, or administrative control.
2. Classify reach: unauthenticated, authenticated, or privileged.
3. Classify effect: read, write, delete, or takeover.
4. Estimate volume from one sample only; never count a full collection.
5. Assign severity: critical for unauthenticated takeover or bulk data, high for cross-user read or write, medium for disclosure that needs a session, low for hygiene.
6. Drop any finding without a captured request and response.

## Signal
- One sample proves a class of records is reachable.
- A read primitive combines with a write primitive.
- A role field is trusted from the client.

## Stop
Two samples per class. No bulk download, no destructive action.

## Output
`record_finding` per finding with severity and impact. Return a table: severity, asset, reach, effect, evidence.
