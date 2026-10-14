# SideKick — The Idea

## One-liner

SideKick listens to your live conversations through Bee, recognizes who you're talking to,
and discreetly surfaces a glanceable card — who they are, your history, and open promises —
before the handshake ends.

## The moment it solves

Someone walks up, starts talking, and you blank: *Who is this? How do I know them? Didn't I
owe them something?* SideKick recognizes who you're with from the live conversation and puts
the answer on your wrist in seconds — so you're never caught out, and never drop a promise.

## Why it is uniquely possible with Bee

SideKick is designed around the one thing a wearable ambient AI can do that nothing else can:
**passively capture what *other people* say in real conversations.** Two filters define the idea.

### Filter 1 — Could ChatGPT (or any phone voice assistant) ever have had this input?

**No.** Phone voice assistants are *active and session-based*: they only hear what you
deliberately say *to them*. SideKick runs on what your coworker, your doctor, or a new contact
said *to you*, in a conversation you never consciously recorded. Bee transcribes these with
speaker identification (`speaker_1`, `speaker_2`, …). That input never reaches a phone assistant.

### Filter 2 — Does Bee's own app already do this?

**No.** Bee natively *stores* transcripts, facts, todos, and summaries — so anything that merely
"extracts todos from a conversation" is redundant with Bee itself. Bee never *pushes context to
you live, mid-conversation.* SideKick is the **real-time action layer** Bee deliberately leaves
to developers, exactly as the track invites ("integrate Bee's CLI, MCP, or Agent Skills with
other services, devices, or developer tools").

Every feature in SideKick must pass **both** filters.

## The Apple Watch fit

The user's Bee data comes from an **Apple Watch**, and the watch is the perfect discreet,
glanceable surface for an in-the-moment whisper — you can't pull out a phone mid-handshake.
The data source and the output surface live on the same device.

## The card

When a conversation starts, SideKick surfaces:

1. **Who** — "This is Sarah Chen, Head of Design at Northwind."
2. **How you know them** — "Met at the Lisbon conference, introduced by Mike."
3. **Last time** — "You last spoke 3 weeks ago about her team's hiring."
4. **Open loops** — "⚠️ You promised to send her the onboarding doc." / "She owes you the invoice."
5. **Don't forget / avoid** — "Bring up the partnership." / "Avoid: her recent layoff."
6. **Name rescue** — the quiet save when you've completely blanked.

## Who it's for (Potential Impact)

- Networkers, founders, salespeople, politicians, executives — anyone who meets many people.
- **Accessibility:** a genuinely powerful aid for people with **prosopagnosia (face-blindness)**,
  memory impairment, or social anxiety. This accessibility story strengthens the *Potential Impact*
  and *Quality of Idea* judging axes.

## Demo flow (under 3 minutes)

1. A person approaches and speaks (staged, two voices).
2. On screen: Bee's live stream fires → SideKick identifies the person → the **card appears in
   seconds**.
3. The card surfaces a **forgotten open promise** — the "whoa" beat that proves the value.
4. After the chat, SideKick drafts the follow-up and writes a **todo back into Bee** — closing
   the loop and proving a two-way integration, not a read-only mention.

## The honest hard part

Bee labels speakers **per-conversation** (`speaker_1`), not globally by real name. "Knowing who
you're talking to" is therefore the central technical challenge. The pragmatic approach:
**name-from-speech** (self-intros and address terms) + **semantic context matching** (Bee
`search --neural` over past conversations and `facts search`) + a **confirm-and-learn** step that
improves identification over time. See [ARCHITECTURE.md](ARCHITECTURE.md).

## Alignment with judging criteria

- **Tech Implementation** — deep use of Bee: real-time SSE stream + facts + conversations +
  semantic search + todo write-back, not a single read call.
- **Design** — one intuitive loop: *talk → recognized → glance → follow-up*.
- **Potential Impact** — credible, repeatable value for networkers and an accessibility audience.
- **Quality of the Idea** — a genuine fit between a wearable memory and an unmet human need, built
  on capabilities only Bee exposes.
