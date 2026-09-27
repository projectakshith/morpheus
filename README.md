# Morpheus

> *"Unfortunately, no one can be told what the Matrix is. You have to see it for yourself."*

Morpheus is a terminal-first, agentic pair programming harness.

## Architecture

- **Morpheus**: Top-level agent loop & CLI orchestrator (`src/core/agent.ts`)
- **The Operator**: Native SSE streaming client & tool execution engine (`src/provider/operator.ts`, `src/tools/`)
- **The Construct**: Sandbox & disk spillover storage for large tool outputs (`~/.morpheus/construct/`)
- **Session Logger**: Full trajectory, tool calls, and reasoning telemetry (`~/.morpheus/logs/`)

## Features

- **Dual Engine**: Cloud reasoning models (`stealth/space-bunny-alpha` via OpenRouter) and local models (`qwen2.5-coder:7b` via Ollama)
- **Token-Efficient Tools**: `list_dir` (tree), `grep_code` (regex search), `outline_code` (AST symbol map), `read_file` (numbered lines)
- **Autonomous Stall Recovery**: Recovers local models from conversational stalls and advisory deflections
- **Micro-Compaction**: Automatic pruning and tombstoning of historical tool outputs to protect token limits
- **Terminal UI**: Live dimmed thinking indicator, streaming markdown, and aligned box tables

## Usage

```bash
# Cloud mode (default, uses stealth/space-bunny-alpha via OpenRouter)
npx tsx bin/morpheus.ts "how is auth handled in ratio-d"

# Local mode (uses Ollama qwen2.5-coder:7b)
npx tsx bin/morpheus.ts --local "how is auth handled in ratio-d"

# Verbose mode (streams full reasoning and tool execution deltas)
npx tsx bin/morpheus.ts -v "explain the router in backend"
```

## Development

```bash
npm install
npm test
npm run typecheck
```
