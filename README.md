# morpheus

> agentic harness, i suppose.

a minimal, terminal-first autonomous coding harness. fast, aesthetic, and stays out of your way.

```
M/  ●●  01    MORPHEUS
              agentic harness
```

### quickstart

```bash
# install & build
npm install
npm run build
npm link

# launch
morpheus
```

### models

no setup needed: without [neo](https://github.com/projectakshith/neo) or your own key, morpheus runs on **morpheus cloud**, a shared demo model with a hard spending cap, served through openrouter by the worker in [`cloud/`](cloud/). the header shows `capped cloud`, and the first screen says what is sent where.

- `/model` switches between the cloud models (deepseek v4 flash by default)
- `OPENROUTER_API_KEY=...` uses your own openrouter key directly
- `MORPHEUS_BASE_URL` and `MORPHEUS_API_KEY` point at any openai-compatible api
- `morpheus --local` runs on ollama, `MORPHEUS_CLOUD=0` turns the cloud off

### flags

- `morpheus "task"` — jump straight in with an initial prompt
- `morpheus --local` — run locally via ollama (`qwen2.5-coder:7b`)
- `morpheus -v` — stream raw reasoning and tool deltas

### seraph code search

this branch wires in [Seraph](https://github.com/wtfPrethiv/seraph), a code retrieval engine that ranks functions by meaning and searches across git versions (0.9795 nDCG@10 on CoIR AppsRetrieval).

```bash
git clone https://github.com/wtfPrethiv/seraph ~/seraph
cd ~/seraph && uv sync --extra mcp

# inside morpheus
/seraph setup ~/seraph
```

- the agent searches with seraph first when it looks for code by behavior, and keeps grep for exact names
- results show up as ranked cards in the activity panel: relevance bars, a highlighted preview, index reuse and timings
- tools: `search_code`, `search_at_version`, `search_history`, `index_repository`; seraph searches whichever git repo morpheus runs in
- `/seraph status` checks the runtime and index, `/seraph disable` turns it off
- `/versus <question>` (or `/vs`) runs one question through seraph and grep side by side

### daemon

`morpheus serve` runs Morpheus headless: no UI, just a WebSocket API that interfaces like Trinity connect to. Sessions keep running when clients disconnect, and several clients can watch the same session.

```bash
morpheus serve                 # ws://127.0.0.1:7878, token in ~/.morpheus/daemon.json
morpheus serve --host 0.0.0.0  # reachable from other devices (phone over LAN/tailscale)
```

The protocol is documented in [docs/daemon-protocol.md](docs/daemon-protocol.md).

### worker agents

Morpheus can delegate independent research, review, or scoped implementation tasks. Workers receive a separate task and context, run concurrently within limits, and return results to the coordinating agent. Research and review are read-only. Implementation workers must be given exact workspace-relative files; shell commands and commits are disabled, and edits outside that file list are rejected.

By default, a run allows up to 3 concurrent workers, 6 total worker tasks, 20,000 tokens per worker, and 60,000 worker tokens total. All worker usage counts toward the parent run budget. Workers cannot delegate again.

Set role-specific models in `/settings` under runtime. Choices are saved in `~/.morpheus/config.json`; choose “inherit main” to follow the active model. Workers also fall back to the main model until you assign one.

### MCP servers

Morpheus can connect to local MCP servers over stdio. Add server definitions to `~/.morpheus/config.json`; each server process runs with your user permissions, so only configure commands you trust.

```json
{
  "mcpServers": {
    "cua": {
      "command": "cua-driver",
      "args": ["mcp"]
    }
  }
}
```

MCP tools are available to the main agent as `mcp_<server>_<tool>` (for example, `mcp_cua_list_apps`). Tool names are normalized to lowercase letters, numbers, and underscores. Set `"disabled": true` on a server entry to skip it. Morpheus starts configured servers for each run and closes them when the run finishes. MCP servers are not exposed to worker agents. Image results from MCP tools are passed to the selected model, so visual computer use requires a model endpoint that accepts images.

For desktop tasks, install Cua Driver and grant its required OS permissions. The `computer_use` skill guides Morpheus through app discovery, fresh UI snapshots, actions, and verification.
Use `/cua setup` to register Cua Driver in Morpheus, `/cua status` to check installation and permissions, and `/cua enable` or `/cua disable` to control whether Morpheus starts its MCP server.

For code search, [Seraph](https://github.com/wtfPrethiv/seraph) ranks functions and classes by meaning across Git versions. Install it with `uv sync --extra mcp` in its checkout, then run `/seraph setup <path-to-checkout>` (or set `SERAPH_HOME`). It searches whichever Git repository Morpheus is running in and indexes it on the first search. `/seraph status` shows the runtime and index state.

### controls

- `tab` — toggle panel focus (chat / tool calls & telemetry)
- `↑ / ↓` — scroll focused panel
- `enter` — submit prompt
- `esc` — abort active execution
- `ctrl+c` — exit

---

*"free your mind."*
