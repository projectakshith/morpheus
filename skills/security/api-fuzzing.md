---
name: api-fuzzing
category: security
description: Mutate methods, parameters, and formats on a bounded set of endpoints
triggers: ["api fuzzing", "parameter fuzzing", "method fallback", "request mutation", "fuzz endpoint"]
---

# API Fuzzing

## Objective
Find handlers that trust an unexpected method, type, or parameter form.

## Inputs
One endpoint and its observed method.

## Method
1. If GET returns 405, retry POST, PUT, and PATCH once each.
2. If a numeric id returns 500, test `01`, `1.0`, `1e0`, `-1`, `true`, and `null`.
3. If JSON is accepted, send an empty object and then a single unexpected key.
4. Compare status, byte length, and error shape against the baseline.
5. Record only mutations that change behavior, not every failed variant.

## Signal
- A method that returns 200 with data.
- A type change that bypasses validation.
- A stack trace that names an internal framework, query, or file path.

## Stop
Ten variants per parameter, two parameters per pass. No oversized payloads, no injection strings, no destructive writes.

## Output
`record_finding` for each behavior change. Return baseline versus mutated status and the smallest reproducing request.
