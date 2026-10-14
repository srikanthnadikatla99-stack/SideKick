# SideKick — Architecture

This document describes how SideKick turns Bee's live conversation stream into a real-time
social-memory card and a follow-up todo written back into Bee.

See [BEE-INTEGRATION.md](BEE-INTEGRATION.md) for the exact Bee CLI/library calls.

---

## High-level data flow

```
Apple Watch (Bee software)
        │  captures ambient, multi-party audio
        ▼
   Bee cloud  ── transcribes, speaker-labels, extracts facts/todos
        │
        │  real-time SSE: new-utterance, new-conversation, update-conversation
        ▼
┌──────────────────────── SideKick ────────────────────────┐
│                                                           │
│  Ingestion ──▶ Identification ──▶ Context ──▶ Card        │
│  (SSE)         (who is this?)      Assembler   Delivery    │
│                     │                  │          │       │
│                     ▼                  ▼          ▼       │
│              confirm-and-learn   facts / last   WebSocket  │
│                  store           conversation   to glance  │
│                                  / open loops    UI        │
│                                                           │
│  After conversation ends:                                 │
│  Loop Closer ──▶ todos create ──▶ Bee  (follow-up todo)    │
└───────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Bee client wrapper — `src/bee/client.ts`
Thin wrapper over the Bee CLI library (`createBeeClient()` from `@beeai/cli/lib`) plus direct
CLI calls with `--json`. Exposes typed helpers:
- `searchFacts(query)` → facts about a person.
- `getConversation(id)` / `listConversations()` → transcripts and metadata.
- `neuralSearch(query, opts)` → semantic conversation search (`search --neural`).
- `createTodo(text, opts)` → writes a follow-up todo back into Bee.
- `me()` → profile / auth sanity check.

### 2. Ingestion service — `src/ingest/beeStream.ts`
Subscribes to the Bee SSE stream filtered to the relevant event types:
- `new-conversation` → open a **live session** context.
- `new-utterance` → append to the rolling transcript, trigger identification + card refresh.
- `update-conversation` (state `processed`) → trigger the Loop Closer.

Uses the library async iterator `bee.sse.streamJson({ types: [...] })`. Maintains per-session
state (speakers seen, accumulated utterances, current best-guess person).

### 3. Identification engine — `src/identify/identifier.ts`
The core challenge: Bee labels speakers **per-conversation** (`speaker_1`), not by real name.
Resolution is layered:
1. **Name-from-speech** — detect self-intros ("Hi, I'm Mark") and address terms ("Hey Priya")
   in utterances.
2. **Semantic context matching** — run `neuralSearch` over the live transcript content plus
   `searchFacts` to find the most likely known person.
3. **Confirm-and-learn** — present the best guess; on confirmation, persist a person↔cue
   mapping in the local store to improve future matches.

Output: a resolved `Person` (or an "unknown — here's what I could infer" state).

### 4. Context assembler — `src/context/assembler.ts`
Given a resolved person, builds the `Card`:
- **Facts** about them (role, relationships) via `searchFacts`.
- **Last conversation(s)** via `neuralSearch` / `getConversation`.
- **Open loops** from the promise extractor.

### 5. Open-loop / promise extractor — `src/loops/promises.ts`
An LLM pass over recent summaries/transcripts and todos involving the person, extracting
**two-sided** commitments ("you owe them X", "they owe you Y") — the card's highest-impact field.

### 6. Card delivery
The native Apple Watch app (`watch/`, SwiftUI) long-polls `GET /api/state` over HTTPS with a
bearer token; watchOS restricts WebSockets (Apple TN3135). A new person or follow-up triggers a
haptic. Confirm/reject and follow-up approval are `POST` calls back to the server. A debug web
view at `/` mirrors the card during development.

### 7. Loop closer
When a conversation finishes, SideKick suggests a follow-up and calls `createTodo` to write it
back into Bee — the closed loop that demonstrates a genuine two-way integration.

### 8. Supporting modules
- **LLM provider** — `src/llm/provider.ts`: Amazon Bedrock (Converse API) behind a small
  interface, used by identification, card synthesis, and follow-up drafting.
- **Local store** — `src/store/db.ts`: SQLite (`node:sqlite`) for people, learned cues,
  conversation↔person links, and follow-ups. Keeps derived data on-device.
- **Server** — `src/server.ts`: token-authenticated HTTP API (`/api/state` long-poll,
  `/api/confirm`, `/api/reject`, `/api/followups/:id/approve|dismiss`), bound to localhost.

---

## Key data shapes (illustrative)

```ts
type Person = {
  id: string;
  name?: string;
  role?: string;
  org?: string;
  howYouMet?: string;
  cues: string[];            // learned identifying phrases/topics
};

type OpenLoop = {
  direction: "you_owe" | "they_owe";
  text: string;
  sourceConversationId?: string;
};

type Card = {
  person: Person | { unknown: true; inferred?: Partial<Person> };
  lastSpoke?: { when: string; topic: string };
  openLoops: OpenLoop[];
  dontForget?: string[];
  avoid?: string[];
  confidence: number;        // identification confidence
};
```

---

## Design principles

- **Privacy first** — derived state stays on-device (SQLite); Bee data is end-to-end encrypted
  and accessed through the authenticated CLI/library.
- **Graceful degradation** — if identification is uncertain, show inferred context + a confirm
  prompt rather than nothing.
- **Latency budget** — target a visible card within ~5s of the conversation starting.
- **Replayability** — the ingestion layer can be fed recorded real SSE events for deterministic
  tests and a reliable demo.
- **Rule compliance** — the repo genuinely imports and calls Bee (SSE ingest, reads, and a todo
  write), satisfying the track's "call the technology in code" requirement.
