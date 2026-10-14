# SideKick — Build Plan

**Hackathon:** Amazon Developer Hackathon 2026 — Bee (Wearable AI) track. No mini challenges.
**Deadline:** 24 Oct 2026 @ 12:30am GMT+5:30 (~18 days from 2026-10-06).
**Data source:** Apple Watch running Bee software.

See [IDEA.md](IDEA.md) for the concept and [ARCHITECTURE.md](ARCHITECTURE.md) for the design.

---

## Objective

Ship a working demo in which a live, multi-party conversation captured by Bee triggers a
real-time "who is this + our history + open promises" card, and a follow-up todo is written
back into Bee after the conversation.

## Scope decisions

| Decision | Choice | Rationale |
| --- | --- | --- |
| Stack | Node/TypeScript | Matches Bee's `@beeai/cli/lib`, native SSE, TS MCP SDK. |
| MVP demo surface | Web/phone "glance" app | Faster, more reliable for the demo video. |
| Apple Watch native app | Stretch goal | Impressive but heavy (Swift/watchOS). |
| LLM provider | Pluggable; cloud API default | Best quality for demo; Ollama local as a privacy option. |
| Local store | SQLite | On-device, privacy-aligned with Bee's ethos. |
| Repo visibility | TBD (public+MIT recommended) | Public+OSS is simplest; else private + reviewers. |

> Open items are tracked at the bottom of this file.

---

## Milestones

### Phase 0 — Setup & spike (days 1–2)

- [ ] `npm install -g @beeai/cli`; `bee login`; enable Developer Mode (tap app version 5×).
- [ ] Confirm Apple Watch data flows: `bee now`, `bee today --context`.
- [ ] Spike the live stream: `bee stream --json` and the library `bee.sse.streamJson(...)`.
- [ ] Record a set of real SSE events to `fixtures/` for tests and demo replay.
- [ ] Validate key reads: `facts search`, `conversations get`, `search --neural`, `todos create`.

**Exit criteria:** live utterances visible in a terminal; sample events captured; a todo
successfully created in Bee from code.

### Phase 1 — Core pipeline (days 3–7)

- [ ] Bee client wrapper (`src/bee/client.ts`): facts, conversations, neural search, todos.
- [ ] Ingestion service (`src/ingest/beeStream.ts`): consume SSE, manage live-session state.
- [ ] Context assembler (`src/context/assembler.ts`) for a **known** person (defer hard ID):
      build a card from facts + last conversation + open loops.
- [ ] Web glance UI (`web/`) rendering a live card over WebSocket.

**Exit criteria:** speaking near the watch updates a live card for a pre-selected person.

### Phase 2 — Identification engine (days 6–10, overlaps Phase 1)

- [ ] Name-from-speech extraction (self-intros, address terms).
- [ ] Semantic context matching (`search --neural` + `facts search`) → candidate person.
- [ ] Confirm-and-learn store: persist confirmed person↔cue mappings to improve future matches.

**Exit criteria:** an unknown speaker is resolved to the right person with a confirm step.

### Phase 3 — Loop closer + polish (days 10–14)

- [ ] Open-loop / promise extractor (`src/loops/promises.ts`): two-sided commitments.
- [ ] Follow-up suggestion + write todo back to Bee (`todos create`).
- [ ] UI polish to a watch-card aesthetic; latency tuning (card < 5s).

**Exit criteria:** full loop — talk → recognized → card with open promise → follow-up todo in Bee.

### Phase 4 — Demo & submission (days 14–18)

- [ ] Stage real multi-party conversations days ahead to build recall history.
- [ ] Build replay mode (feed recorded real Bee SSE events) for a deterministic demo.
- [ ] Record demo video (< 3 min, YouTube/Vimeo, public, English).
- [ ] Write product feedback for every Bee tool used + a friction log (up to 10% bonus).
- [ ] Finalize repo: README, run instructions, license OR private + reviewers.
- [ ] Full rehearsal with replay fallback.

**Exit criteria:** submission complete per [HACKATHON-SUBMISSION.md](HACKATHON-SUBMISSION.md).

### Stretch (if time allows)

- [ ] Native Apple Watch card (SwiftUI) or watch-style PWA.
- [ ] Custom MCP server exposing SideKick tools (e.g. `who_is`, `open_loops`).

---

## Verification strategy

1. **Unit** — identifier and promise extractor against recorded fixtures.
2. **Integration** — replay recorded SSE events → card renders correct person + open loops.
3. **Manual** — live conversation → card appears in < ~5s; follow-up todo appears in the Bee app.
4. **Rule compliance** — repo genuinely imports/calls Bee (SSE ingest + reads + todo write),
   not a README-only mention.
5. **Demo rehearsal** — full < 3 min run with replay fallback.

## Risks & mitigations

| Risk | Mitigation |
| --- | --- |
| Identification accuracy (the hard problem) | Layered name-from-speech + semantic match + confirm-and-learn; staged demo with seeded history. |
| Real-time latency | Incremental SSE processing; target card < 5s. |
| Live demo flakiness | Replay mode using real recorded Bee events. |
| Apple Watch native scope creep | Keep as stretch; web glance is the MVP. |
| Setup friction (Developer Mode, auth) | Front-loaded in Phase 0. |

## Open items to confirm

1. **MVP surface** — web/phone glance (recommended) vs native Apple Watch app.
2. **LLM provider** — cloud API default vs local Ollama (privacy narrative).
3. **Repo visibility** — public + MIT (simplest) vs private + the six Amazon reviewers.
