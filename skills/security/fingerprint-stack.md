---
name: fingerprint-stack
category: security
description: Identify backend technology and missing security headers
triggers: ["fingerprint stack", "server headers", "tech stack", "x-powered-by", "security headers"]
---

# Stack Fingerprint

## Objective
Turn response headers and diagnostic routes into a concrete backend profile.

## Inputs
One or more in-scope hosts.

## Method
1. Send a GET with `Accept: text/html`.
2. Record `Server`, `X-Powered-By`, `X-AspNet-Version`, `Via`, and `Set-Cookie`.
3. Compare against known defaults for nginx, Apache, IIS, Express, PHP, ASP.NET, and Spring.
4. Check only these diagnostic paths: `/info.php`, `/phpinfo.php`, `/.env`, `/.git/config`, `/server-status`.
5. Flag absent `Content-Security-Policy`, `X-Frame-Options`, and `Strict-Transport-Security` separately from version disclosure.

## Signal
- A diagnostic path returning 200 with configuration content.
- A framework version that maps to a known advisory.
- A debug cookie or stack trace in the body.

## Stop
One request per diagnostic path per host. Never download `.env` or `.git/config` contents; record status and byte length only.

## Output
`record_finding` for exposed diagnostics and version disclosure. Return server, framework, and missing-header list.
