# Morpheus daemon protocol (v1)

`morpheus serve` runs the agent headless. Interfaces (the TUI, Trinity on Mac/Android, scripts) are clients: they send requests and receive a stream of events. Several clients can watch and drive the same session at once.

Everything the TUI shows or can do is available here: the thread feed with thinking/tool/note steps, file diffs, usage, git state, every slash command, autocomplete, Neo status/models/login and worker settings. A client needs no access to the host's filesystem or Neo.

Types live in `src/protocol/types.ts`; the state reducer every client should use is `src/protocol/reducer.ts`.

## Running

```bash
morpheus serve                       # ws://127.0.0.1:7878, this machine only
morpheus serve --host 0.0.0.0        # reachable on the LAN
morpheus serve --host 100.x.y.z      # bind to your tailscale IP only
morpheus serve --rotate-token        # invalidate every paired device
```

`GET /health` returns `{ ok, server, version, protocol }` without auth.

## Connecting

Open a WebSocket to the daemon with the token from `~/.morpheus/daemon.json`, either as `?token=…` (browsers) or `Authorization: Bearer …`. A wrong or missing token is rejected with HTTP 401 before the upgrade. The token grants shell access to the host machine.

Messages are JSON-RPC 2.0. The server pings every 30s and drops connections that miss a pong.

## Methods

| method | params | result |
|---|---|---|
| `initialize` | `{ client?: { name, version? } }` | `{ server, version, protocol, defaultModel, cwd }` |
| `session.list` | `{ cwd?, limit? }` | `{ sessions: SessionListItem[] }`, saved and live, newest first |
| `session.create` | `{ cwd?, model? }` | `{ session: SessionSnapshot }` |
| `session.subscribe` | `{ sessionId, afterSeq? }` | `{ snapshot }` or `{ events }` (see below) |
| `session.unsubscribe` | `{ sessionId }` | `{ ok }` |
| `session.rename` | `{ sessionId, title }` | `{ ok }` |
| `session.setModel` | `{ sessionId, model }` | `{ ok }`, applies from the next turn |
| `session.setMaxSteps` | `{ sessionId, maxSteps \| null }` | `{ ok }`; null restores the default |
| `session.delete` | `{ sessionId }` | `{ ok }`; fails with `-32002` while running |
| `turn.start` | `{ sessionId, prompt }` | `{ threadId, queued }`, queued if a turn is already running; `{ command: true }` for slash commands |
| `turn.abort` | `{ sessionId }` | `{ ok }`; stops the running turn and cancels the queue |
| `commands.list` | `{}` | `{ commands: [{ name, description, aliases }] }` |
| `autocomplete` | `{ sessionId, input, cursorPos?, history? }` | the TUI's suggestions (`/commands`, `@files`, history, intents); history defaults to the session's prompts |
| `workspace.diff` | `{ sessionId }` | `{ diff }`, `git diff HEAD` in the session's cwd (empty outside git) |
| `settings.get` | `{}` | `{ subagentModels, baseURL, isLocal }` |
| `settings.set` | `{ subagentModels }` | `{ ok }`, saved to `~/.morpheus/config.json` |
| `neo.request` | `{ path, method?, body? }` | `{ status, body }` relayed to Neo; only `/health`, `/v1/models` and `/v1/auth/*` |

`turn.start` passes input through the same command registry as the TUI, so `/help`, `/neo`, `/usage`, `/skills`, `/login`, `/queue`, `/stop`, `/cua`, `/log`, `/sessions`… all work; they run immediately even mid-turn, and their output arrives as `thread.upserted` events. Commands that would open a TUI modal print their text form instead. A client with its own UI can intercept those locally (e.g. open a model picker for `/model`, using `neo.request /v1/models`).

Saved sessions are loaded on demand, so any session id from `session.list` (including ones the TUI created) can be subscribed to or continued.

Errors: `-32700` parse, `-32600` bad request, `-32601` unknown method, `-32602` bad params, `-32603` internal, `-32001` session not found, `-32002` session busy.

## Events

After `session.subscribe`, the daemon pushes notifications:

```json
{ "jsonrpc": "2.0", "method": "event", "params": { "type": "text.delta", "seq": 42, "sessionId": "sess_…", "ts": 1790000000000, "threadId": "thread_…", "delta": "hel" } }
```

Every event carries `seq` (per session, strictly increasing), `sessionId` and `ts`.

| type | fields | meaning |
|---|---|---|
| `session.updated` | `title?`, `model?`, `maxSteps?` | title generated or renamed, model switched, step limit changed |
| `session.switched` | `to` | `/new` or `/resume` replaced this session; subscribe to `to` |
| `ui.request` | `modal` | a command wants an interactive picker (bare `/model`); act on it live, ignore on replay |
| `workspace` | `workspace` | git branch / status changed (checked after each turn and command) |
| `status` | `status`, `queued` | `idle` / `running` / `error` / `aborted`, plus queue length |
| `turn.queued` | `threadId`, `index`, `prompt` | prompt waiting behind the running turn |
| `turn.started` | `threadId`, `index`, `prompt`, `model` | turn began (also for a previously queued thread) |
| `step.started` | `threadId`, `step` | agent loop step number |
| `thinking.started` / `thinking.ended` | `threadId`, `stepId` | reasoning block opened / closed (empty blocks are dropped) |
| `reasoning.delta` | `threadId`, `stepId`, `delta` | streamed reasoning |
| `text.delta` | `threadId`, `delta` | streamed answer text |
| `narration` | `threadId`, `stepId`, `text` | streamed text turned out to be mid-run narration; response resets, text becomes a note step |
| `tool.started` | `threadId`, `stepId`, `name`, `args` | tool call began |
| `tool.finished` | `threadId`, `stepId`, `output`, `isError` | tool call result |
| `file.edited` | `record` | a successful `edit_file` / `write_file`, with diff lines |
| `findings` | `findings` | the agent's recorded findings changed |
| `thread.upserted` / `thread.removed` | `thread` / `threadId` | whole-thread writes from slash commands |
| `usage` | `usage` | cumulative session token usage |
| `turn.finished` | `threadId`, `outcome`, `response` | `completed` / `aborted` / `error`, with the final response |

## State and reconnecting

Clients don't hand-roll state. Start from a snapshot and fold events into it:

```ts
import { applyEvent } from "morpheus/src/protocol/reducer";
let state = (await rpc("session.subscribe", { sessionId })).snapshot;
onEvent((e) => (state = applyEvent(state, e)));
```

The reducer is pure and takes time only from `event.ts`, so a client ends up with exactly the daemon's state.

To resume after a dropped connection (phones do this constantly), subscribe again with `afterSeq: state.seq`:

- `{ events }`: everything missed, in order; fold them in.
- `{ snapshot }`: the gap fell outside the replay buffer (20k events per session) or the daemon restarted; replace local state.

## Snapshot

`SessionSnapshot` holds `id, title, cwd, model, maxSteps?, createdAt, updatedAt, status, queued, threads, fileEdits, findings, usage?, workspace { isGit, branch?, gitStatus? }, seq`. Elapsed time and step count per turn come from each thread's `startTime`, `durationMs` and `stepCount`.

## Not in v1

- Tool approvals (`approval.request` event / `approval.respond` method): needs a hook in `runAgent` first.
- Push notifications for runs finishing or waiting while no client is connected.
- Pairing via QR code; for now copy the token.
