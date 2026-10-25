---
name: evidence-report
category: security
description: Assemble a responsible-disclosure dossier from confirmed evidence
triggers: ["disclosure report", "security report", "evidence report", "responsible disclosure", "findings dossier"]
---

# Evidence and Report

## Objective
Produce a dossier that another engineer can reproduce without repeating the engagement.

## Inputs
Confirmed findings and their evidence files.

## Method
1. Group findings by asset and severity.
2. For each finding, include the exact request, the response status and headers, and a redacted body excerpt.
3. Redact tokens, cookies, passwords, and personal data. Keep field names, status codes, and byte lengths.
4. State preconditions and the smallest reproduction steps.
5. Write remediation as a concrete control, not a slogan.
6. Add a coverage section naming what was not tested.

## Report shape
- Summary
- Scope and authorization reference
- Findings, ordered by severity
- Evidence per finding
- Impact
- Remediation
- Coverage gaps

## Stop
No finding without evidence. No raw personal data. No speculation presented as confirmed.

## Output
Write `report.md` in the engagement folder and return its path with the finding count.
