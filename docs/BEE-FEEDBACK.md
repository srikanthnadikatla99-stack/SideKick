# Bee Developer Feedback — SideKick

Product feedback, friction log, and feature requests for every Bee tool SideKick uses, kept per
tool and updated as we build. Feeds the submission requirements in
[HACKATHON-SUBMISSION.md](HACKATHON-SUBMISSION.md).

**Severity scale:** **Blocker** (cannot proceed) · **High** (major rework or unreliable workaround)
· **Medium** (clean workaround, but costs time or adds complexity) · **Low** (minor inconvenience).

**Environment:** macOS (Apple Silicon), Node 24.3, `@beeai/cli` 0.7.3, Apple Watch running Bee.

---

## 1. Bee CLI (`bee`)

### Product feedback
- **Used for:** Exploring commands, recording live events into fixtures, and as the runtime that
  the Node library shells out to.
- **Worked well:**
  - `npm install @beeai/cli` ships prebuilt binaries for each platform, so there's no native
    build step.
  - The `--help` text is precise. For example, it states that `--neural` searches conversations
    only and can't be combined with `--filter`, `--sort` or `--scope`.
  - Every read and write command has `--json`.
- **Needs work:** see the friction entries below.
- **Onboarding:** _to fill after `bee login` + Developer Mode._
- **Build with it again?** _…_

### Friction log

#### F-01 · `bee stream --json` event type is undocumented and inconsistent — **Low** (revised after live testing)
- **Task attempted:** Get `new-conversation`, `new-utterance` and `update-conversation` events from
  one stream and handle each event type differently.
- **Steps taken:**
  1. Ran `bee stream --help`; it shows `--types` and `--json`.
  2. Read how the CLI formats events. In JSON mode it prints only `event.data` (the raw payload).
  3. Read the library's `createJsonSseStream`, which skips the SSE `event:` lines.
  4. Recorded a live session: real `new-utterance` payloads *do* include `"type": "new-utterance"`,
     but keep-alive lines (`{"timestamp": …}`) on the same stream carry no type at all.
- **Expected:** Each JSON line says which event it is, documented for every event type.
- **Actual:** The type field appears in some payloads but not others, and none of this is documented,
  so we couldn't rely on it before seeing live data.
- **Workaround:** Open one filtered stream per event type (`--types <one>`) and label each event
  with the type of the stream it came from; ignore payloads without a conversation id.
- **Suggestion:** Document the payload schema per event (including keep-alives), and add `event` to the
  library's `JsonSseEvent`.

#### F-05 · Bee iOS app not findable in a non-US App Store — **Blocker**
- **Task attempted:** Install the Bee iOS app (prerequisite for Developer Mode, Apple Watch capture,
  and every CLI call) as a hackathon participant outside the US.
- **Steps taken:** Searched the App Store on iPhone for "Bee"; checked bee.computer, whose store
  badge links to the US storefront (`apps.apple.com/us/app/bee-your-personal-ai/id6480349491`).
- **Expected:** The app is installable by hackathon participants, or the track docs say how to get access.
- **Actual:** The app did not appear in search on the participant's storefront; the site notes
  "Bee ships only to the United States".
- **Workaround:** _TBD (US-region Apple ID for Media & Purchases, or access via organizers)._
- **Suggestion:** State region availability up front in docs.bee.computer and the hackathon track
  page, and provide a non-US path for hackathon participants (TestFlight, or an unlisted link).

#### F-06 · TLS failure behind a corporate proxy gives no actionable hint — **Low**
- **Task attempted:** `bee login` from a corporate laptop.
- **Steps taken:** `bee status` → "Not logged in"; `bee login` failed; `bee ping` printed only
  `unable to verify the first certificate`. Inspected the chain with `openssl s_client`: a TLS-inspecting
  proxy (Zscaler) was re-signing `app-api-developer.ce.bee.amazon.dev` with an untrusted certificate.
- **Expected:** An error naming the host and suggesting proxy/CA causes (e.g. `NODE_EXTRA_CA_CERTS`).
- **Actual:** A bare TLS message; root cause required manual certificate inspection.
- **Workaround:** Run from a network/machine without TLS inspection (or have IT allowlist the Bee API host).
- **Suggestion:** On TLS errors, print the API host, the presented issuer, and a short "behind a
  corporate proxy?" hint; document required hosts for allowlisting.

---

## 2. Node library (`@beeai/cli/lib`)

### Product feedback
- **Used for:** All of SideKick's Bee access: `createBeeClient()`, `sse.streamJson` for live
  ingestion, `api.search({ neural: true })`, `api.conversations.get`, `api.todos.create`, and
  `runJson` for commands the library doesn't wrap.
- **Worked well:**
  - The client surface is small and readable (`auth`, `api`, `sse`, `runJson`).
  - The SSE stream is an async iterator, which suits `for await` ingestion.
  - Search options are a discriminated union, so neural + filter combinations that aren't allowed
    fail at compile time.
- **Needs work:** see the friction entries below.
- **Build with it again?** _…_

### Friction log

#### F-02 · Library needs `bee` on PATH even when installed locally — **Low**
- **Task attempted:** Use `@beeai/cli/lib` from a project that installs `@beeai/cli` as a normal
  dependency (no global install).
- **Steps taken:** Added `@beeai/cli` as a project dependency, then read `createBeeCliRunner`.
- **Expected:** The library finds the binary that ships inside its own package.
- **Actual:** It defaults to `command: "bee"`, which only resolves with a global install or a
  `node_modules/.bin` PATH entry.
- **Workaround:** Pass `createBeeClient({ command: "<project>/node_modules/.bin/bee" })`.
- **Suggestion:** Default to the package's own `bin/bee.js` and fall back to `bee` on PATH.

#### F-03 · No library helpers for `facts search`, `conversations transcript`, `conversations related` — **Low**
- **Task attempted:** Search facts about a person, and fetch only the new utterances of a live
  conversation.
- **Steps taken:** Compared `DataApi` in `dist/lib/api.d.ts` with `bee facts --help` and
  `bee conversations --help`.
- **Expected:** One-to-one coverage of the CLI commands.
- **Actual:** `DataApi.facts` has list/get/create/update/confirm/delete but no `search`.
  `DataApi.conversations` has list/get but no `transcript` or `related`. `todos` has no
  `complete` or suggestions helpers.
- **Workaround:** `bee.runJson(["facts", "search", "--query", q, "--limit", "10"])`.
- **Suggestion:** Generate `DataApi` from the same command registry the CLI uses, so the two
  can't drift apart.

#### F-04 · Responses are untyped (`Promise<unknown>`) — **Medium**
- **Task attempted:** Get conversation IDs and timestamps out of neural search results to build
  the "last time you spoke" line.
- **Steps taken:**
  1. Checked `api.d.ts`; every method returns a caller-supplied generic, defaulting to `unknown`.
  2. The CLI's tool description says search "returns the server response verbatim".
- **Expected:** Exported response types, or a documented JSON schema for each command.
- **Actual:** The response shapes have to be found by trial and error against live data.
- **Workaround:**
  - A tolerant walker finds conversation IDs in any response shape.
  - Raw, truncated JSON is passed to the LLM rather than relying on parsed fields.
- **Suggestion:** Publish TypeScript response types (or JSON Schema) for `search`, `facts`,
  `conversations` and `todos`, and document them on docs.bee.computer.

---

## 3. Real-time stream (SSE)

### Product feedback
- **Used for:** The core trigger. Each `new-utterance` runs person identification and refreshes
  the card. `update-conversation` with state `processed` triggers the follow-up todo.
- **Worked well:** Server-side `--types` filtering keeps traffic down. Utterances arrived within a few
  seconds of being spoken, fast enough for an in-conversation card.
- **Needs work:** see F-01, F-07, F-08.

### Friction log

#### F-07 · Live utterances arrive out of order, with undocumented time fields — **Medium**
- **Task attempted:** Detect a greeting ("Hi Riya, how are you?") at the very start of a conversation.
- **Steps taken:** Recorded the live stream during a real conversation and compared it with Bee's
  final transcript.
- **Expected:** Utterances in spoken order, with a documented timestamp format.
- **Actual:** "Hi Riya" (`start: 1.68`) arrived *after* utterances at `start: 3.76` and `6.64`.
  `spoken_at` is an ISO string while `start`/`end` are seconds from conversation start; neither is
  documented. Our first look at the conversation therefore had no name in it.
- **Workaround:** Re-sort each conversation's utterances by `start` on arrival; parse `spoken_at` as ISO.
- **Suggestion:** Document the utterance schema and ordering guarantees; either deliver in order or
  include a sequence number.

#### F-08 · No speaker labels in the live stream from Apple Watch — **Medium**
- **Task attempted:** Tell the wearer's words apart from the other person's.
- **Steps taken:** Inspected live `new-utterance` payloads and the processed transcript.
- **Expected:** `speaker_1` / `speaker_2` labels, as described in the docs.
- **Actual:** Live utterances have no `speaker` field, and the processed transcript says
  "Speaker attribution was not available; all speakers are listed as Unknown". The ASR also spelled
  the same name two ways in one conversation ("Riya" and "Ria").
- **Workaround:** Identify people from what is said (greetings, introductions, topics) rather than who
  says it; treat near-identical name spellings as one person.
- **Suggestion:** Expose speaker diarization for Apple Watch captures (or document when it's
  unavailable), and consider a per-user vocabulary so recurring names are spelled consistently.

---

## 4. Search (`search --neural`)

### Product feedback
- **Used for:** Matching what's being said live against past conversations to guess who you're
  talking to, and finding the last conversation with them.
- **Worked well:** The help text clearly states which flags apply to neural search.
- **Needs work:** The response shape is undocumented (F-04). _Relevance/latency notes after live testing._

---

## 5. Todos API (write-back)

### Product feedback
- **Used for:** Writing the approved follow-up back into Bee (`todos create --text [--alarm-at]`).
- **Worked well:** First call from the EC2 server succeeded and returned the new todo id; the todo
  appeared in the Bee iOS app immediately. Simple, predictable write path.
- **Needs work:** _…_

---

## 6. Bee MCP server (`bee mcp`)

### Product feedback
- **Used for:** _Not used in the core pipeline yet; evaluate for the custom MCP stretch goal._
- **Worked well:** _…_
- **Needs work:** _…_

---

## 7. Agent Skill (`bee-skill`)

### Product feedback
- **Used for:** _Not used yet._

---

## Feature requests

| # | Request | Why it matters | Urgency |
| --- | --- | --- | --- |
| R-01 | Speaker identity that persists across conversations (a stable ID for the same voice instead of a fresh `speaker_N` each time) | Real-time "who am I talking to" apps currently have to guess identity from text; a stable voice ID would make identification far more reliable. | Important |
| R-02 | Event name in `stream --json` output and in the library's `JsonSseEvent` (see F-01) | One connection instead of one per event type; reliable event ordering. | Important |
| R-03 | Typed responses for the library (see F-04) | Faster, safer integrations; fewer shape guesses against live data. | Nice-to-have |
| R-04 | Let other apps start/stop/check Bee capture (App Intents / Shortcuts actions such as "Start Bee capture", plus a capture-state field in the API) | Companion apps like SideKick can't launch or control the Bee watch app, so users must juggle two apps; a "Start Bee" intent would allow a single entry point and a "Bee isn't capturing" warning. | Important |
