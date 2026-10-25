---
name: security-engagement
category: security
description: Coordinate one authorized web engagement across recon, analysis, probing, impact, and reporting
triggers: ["security engagement", "ethical hacking", "penetration test", "pentest", "attack surface"]
---

# Engagement Router

## Gate
1. A scope file must exist at `.morpheus/engagement.json`.
2. Test only hosts inside `allowedHosts`.
3. Use only methods listed in `allowedMethods`.
4. Stay under `maxRequestsPerSecond`.
5. Stop on 429, three consecutive 5xx responses, or two confirmed records.

## Phases
`RECON -> STATIC -> PROBE -> IMPACT -> REPORT`

Advance only when the current phase produced evidence. If a phase stalls, say what is missing instead of guessing.

## Dispatch
| Need | Playbook | Worker |
|---|---|---|
| Hosts and ports | `recon-surface`, `network-recon` | explore |
| Tech and headers | `fingerprint-stack` | explore |
| Hidden paths | `path-discovery` | explore |
| JavaScript intel | `js-intel` | explore |
| Sessions and logins | `auth-session` | review |
| Object and role access | `access-control` | review |
| Request mutation | `api-fuzzing` | review |
| Blast radius | `impact-assessment` | review |
| Dossier | `evidence-report` | review |

Run at most three workers at once. Each worker task must name its capability so the playbook loads on its own prompt.

## Output
Record every confirmed issue with `record_finding`: topic, takeaway, severity, endpoint, evidence path. Return confirmed findings only; raw responses stay in evidence files.
