# Bee Developer Feedback — SideKick

**Environment:** macOS (Apple Silicon), Node 24, `@beeai/cli` 0.7.3, Apple Watch running Bee.

---

## Product feedback

| Tool | Used for | Worked well | Needs work |
| --- | --- | --- | --- |
| Bee CLI (`bee`) | Login, recording live events for replay, runtime for the Node library | Prebuilt binaries via npm; precise `--help`; `--json` on every command | — |
| Node library (`@beeai/cli/lib`) | All of SideKick's Bee calls | Small API; SSE stream as an async iterator; invalid search options caught at compile time | Needs `bee` on PATH (F-02); missing helpers (F-03); untyped responses (F-04) |
| Real-time stream (SSE) | Each utterance refreshes the card; a processed conversation triggers the follow-up | Server-side `--types` filter; utterances arrive within seconds | Event names, ordering, speaker labels (F-01, F-06, F-07) |
| Search (neural + facts) | Matching live talk to past conversations and known facts about a person | Help text clearly states which flags work with `--neural` | Response shapes undocumented (F-04) |
| Todos API | Writing the approved follow-up back into Bee | First call worked; the todo appeared in the Bee app immediately | — |

**Onboarding:** Enabling Developer Mode and the CLI itself were straightforward. The blocker
was getting the Bee app outside the US (F-05).

---

## Friction log

Severity: **Blocker** (cannot proceed) · **Medium** (workaround costs time) · **Low** (minor).

#### F-01 · `bee stream --json` drops the event name — Low
- **Task / steps:** Handle three event types from one stream; ran `bee stream --json` and read the
  library's SSE parser.
- **Expected vs actual:** Each line names its event → only the payload is printed; keep-alives have no
  type; payloads are undocumented.
- **Workaround:** One filtered stream per event type (`--types <one>`).
- **Suggestion:** Include the event name in JSON output and `JsonSseEvent`; document payloads.

#### F-02 · Library needs `bee` on PATH even when installed locally — Low
- **Task / steps:** Used `@beeai/cli/lib` as a project dependency, without a global install.
- **Expected vs actual:** Library uses its bundled binary → it defaults to `bee` on PATH.
- **Workaround:** `createBeeClient({ command: "<project>/node_modules/.bin/bee" })`.
- **Suggestion:** Default to the package's own binary, then fall back to PATH.

#### F-03 · No library helper for `facts search` — Low
- **Task / steps:** Search facts about a person; compared the library's `DataApi` with `bee facts --help`.
- **Expected vs actual:** Library covers the CLI commands → `facts` has no `search`.
- **Workaround:** `bee.runJson(["facts", "search", "--query", q])`.
- **Suggestion:** Generate the library API from the CLI's command list so they can't drift apart.

#### F-04 · Responses are untyped (`Promise<unknown>`) — Medium
- **Task / steps:** Read conversation IDs and dates out of neural search results.
- **Expected vs actual:** Typed or documented responses → shapes found by trial and error on live data.
- **Workaround:** A tolerant ID walker; raw JSON passed to the LLM.
- **Suggestion:** Publish TypeScript types or JSON Schema for search, facts, conversations and todos.

#### F-05 · Bee iOS app not available in a non-US App Store — Blocker
- **Task / steps:** Install the Bee app (needed for Developer Mode and Apple Watch capture); searched
  the App Store and followed the bee.computer link.
- **Expected vs actual:** App is installable, or docs explain access → not listed; the site says
  "Bee ships only to the United States".
- **Workaround:** None documented; had to work out the App Store region issue ourselves.
- **Suggestion:** State region availability in the developer docs and offer a non-US path.

#### F-06 · Live utterances arrive out of order — Medium
- **Task / steps:** Detect "Hi Riya" at the start of a conversation; compared the recorded stream
  with Bee's final transcript.
- **Expected vs actual:** Spoken order → "Hi Riya" (`start: 1.68`) arrived after `3.76` and `6.64`;
  time fields undocumented.
- **Workaround:** Re-sort each conversation's utterances by `start`.
- **Suggestion:** Deliver in order or add a sequence number; document the utterance schema.

#### F-07 · No speaker labels from Apple Watch — Medium
- **Task / steps:** Tell the wearer's words from the other person's; inspected live and processed data.
- **Expected vs actual:** `speaker_1` / `speaker_2` labels → no speaker field; transcript lists all
  speakers as Unknown; the same name spelled "Riya" and "Ria".
- **Workaround:** Identify people from what is said; treat near-identical names as one person.
- **Suggestion:** Speaker labels for Apple Watch captures, and a per-user name vocabulary.

---

## Feature requests

| # | Request | Why it matters | Urgency |
| --- | --- | --- | --- |
| R-01 | Speaker identity that persists across conversations | Apps like SideKick must guess who is talking from text alone; a stable voice ID would make this reliable. | Important |
| R-02 | Event name in `stream --json` and `JsonSseEvent` (F-01) | One connection instead of one per event type. | Important |
| R-03 | Typed library responses (F-04) | Faster, safer integrations. | Nice-to-have |
| R-04 | Let other apps start/stop/check Bee capture (e.g. a "Start Bee capture" Shortcut) | Users must switch between SideKick and the Bee watch app today; this allows one entry point and a "Bee isn't capturing" warning. | Important |
