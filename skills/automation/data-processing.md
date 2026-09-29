---
name: data-processing
category: automation
description: High-speed JSON, CSV, and log file parsing and transformation
triggers: ["json", "csv", "log parsing", "jq", "data transform", "etl"]
---

# Data Processing Skill

## Techniques
1. **JSON Stream Processing**: For large JSON files, use streaming / line-delimited JSON (`ndjson`) or `jq` rather than loading entire multi-GB payloads into memory.
2. **Deterministic Transforms**: Ensure field ordering, date formats (ISO 8601), and float precision are strictly normalized.
3. **Validation & Sanitation**: Sanitize unexpected null values, parse invalid numbers to `0` or `null` explicitly, and handle BOM headers in CSVs gracefully.
