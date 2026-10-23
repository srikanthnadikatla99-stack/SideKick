# Bee Integration Reference

Grounded notes on the Bee developer surface that SideKick builds on. Sourced from the official
Bee developer docs and repositories.

- Docs: https://docs.bee.computer/
- CLI: https://github.com/bee-computer/bee-cli (`@beeai/cli`, TypeScript, MIT)
- Skill: https://github.com/bee-computer/bee-skill

---

## What Bee provides

Bee is an encrypted wearable (also iOS app / Apple Watch) that passively captures conversations
and transforms ambient audio into:

- Conversation transcripts with **speaker identification** (`speaker_1`, `speaker_2`, …)
- Daily summaries
- **Facts** — things Bee learns and remembers about you
- **Todos** — action items extracted from conversations
- Insights, journals, locations, photos

Understands 40+ languages. Data is end-to-end encrypted and accessible only to you.

---

## Prerequisites (critical)

1. Install the CLI: `npm install -g @beeai/cli`.
2. Install the latest Bee app and **enable Developer Mode** (tap the app version 5× in Settings).
3. Authenticate: `bee login` (interactive, `--token`, or proxy). `bee status` to verify.
4. An Apple Watch running Bee software feeds data into the Bee app → available via CLI/API.

---

## CLI commands SideKick uses

| Command | Purpose in SideKick |
| --- | --- |
| `bee stream --types new-utterance,new-conversation,update-conversation --json` | Real-time ingestion of the live conversation. |
| `bee now --json` | Recent conversations (last 10h) with utterances — context + demo seeding. |
| `bee search --query <text> --neural` | Semantic match of live content against past conversations (identification). |
| `bee facts search --query <text> --json` | Facts about a candidate person. |
| `bee conversations get <id> --json` | Full transcript + metadata for the last conversation with someone. |
| `bee conversations transcript <id> --since <epochMs> --json` | Poll only new utterances of a live conversation. |
| `bee todos create --text <text> [--alarm-at <iso>] --json` | Write a follow-up todo back into Bee (closes the loop). |
| `bee me --json` | Auth / profile sanity check. |

Other available command groups (not all used): `today`, `activity`, `changed`, `daily`,
`journals`, `insights`, `locations`, `photos`, `sync`, `proxy`, `ping`, `version`.

---

## Programmatic access (Node library)

The CLI ships a library wrapper that shells out to the `bee` binary with JSON output. Ensure
`bee` is on `PATH`.

```ts
import { createBeeClient } from "@beeai/cli/lib";

const bee = createBeeClient();

// Profile / auth check
const profile = await bee.api.me();

// Real-time stream (async iterator) — the heart of SideKick ingestion
const stream = bee.sse.streamJson({ types: ["new-utterance"] });
for await (const event of stream.events) {
  console.log(event.data);
}
```

---

## Real-time stream events (SSE)

Received via `bee stream` or `bee.sse.streamJson`. Each event has an `event` name and a JSON
`data` payload. Event types SideKick cares about:

### `new-utterance` — new transcript snippet (primary signal)
```json
{ "utterance": { "text": "Hello there", "speaker": "speaker_1" },
  "conversation_uuid": "uuid-string" }
```

### `new-conversation` — conversation created (open a live session)
```json
{ "conversation": { "id": 123, "uuid": "uuid-string", "state": "processing", "title": "Optional" } }
```

### `update-conversation` — conversation updated (trigger loop closer when `processed`)
```json
{ "conversation": { "id": 123, "state": "processed", "title": "Optional", "short_summary": "Optional" } }
```

Other events available: `connected`, `update-conversation-summary`, `delete-conversation`,
`update-location`, `todo-created/updated/deleted`, `journal-created/updated/deleted`,
`journal-text`. Use `--agent` for single-line output and `--webhook-endpoint` for webhooks.

---

## MCP server (optional / stretch)

The CLI **is** an MCP server using your existing Bee login:

```bash
bee mcp connect claude          # one-click install for Claude Desktop
bee mcp serve                   # stdio JSON-RPC (what connectors launch)
bee mcp serve-http --port N     # local HTTP, 127.0.0.1, bearer token (>= 32 chars)
```

HTTP transport binds to localhost and requires an auth token via `--token` or
`BEE_MCP_HTTP_TOKEN`, sent as `Authorization: Bearer <token>`. Read/search/manage capabilities
are exposed as MCP tools (`bee_search`, `bee_list_facts`, `bee_get_daily_summary`, …).

A SideKick stretch goal is a **custom MCP server** exposing higher-level tools (`who_is`,
`open_loops`) built on this data.

---

## Agent Skill (reference)

`bee-skill` connects AI agents to Bee context. Install: `npx skills add bee-computer/bee-skill`.
Requires the Bee CLI installed and an authenticated session.

---

## Replay

- Recorded real Bee events can be replayed for deterministic tests and demos; facts, neural
  search, and todo write-back still call live Bee.
