# Morpheus

> *"Unfortunately, no one can be told what the Matrix is. You have to see it for yourself."*

Morpheus is a terminal-first, agentic pair programming harness.

## Architecture

- **Morpheus**: Top-level agent loop & CLI orchestrator
- **The Operator**: Execution engine for file tools & shell processes
- **The Construct**: Sandbox & disk spillover storage for large tool outputs

## Development

```bash
# Install dependencies
npm install

# Run CLI in dev mode
npm run dev

# Typecheck
npm run typecheck
```
