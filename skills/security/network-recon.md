---
name: network-recon
category: security
description: Check ports, services, and TLS for an in-scope host
triggers: ["network recon", "nmap", "open ports", "tls review", "service scan"]
---

# Network Recon

## Objective
Identify services that widen the blast radius beyond the web application.

## Inputs
In-scope host or IP.

## Method
1. Resolve the host before scanning.
2. Run `nmap -sV --top-ports 100 <host>` through the shell tool.
3. Flag database ports 1433, 3306, 5432, 27017 and management ports 22, 3389, 5900, 8080, 8443.
4. Check TLS with `openssl s_client -connect <host>:443 -servername <host>` and record protocol and certificate expiry.
5. Do not attempt authentication against any discovered service.

## Signal
- A database or management port reachable from the internet.
- A deprecated TLS protocol or an expired certificate.
- A service version matching a known advisory.

## Stop
Top 100 ports only. No OS detection, no scripts, no brute force. One scan per host per engagement.

## Output
`record_finding` for exposed management or data services. Return port, service, version, and exposure.
