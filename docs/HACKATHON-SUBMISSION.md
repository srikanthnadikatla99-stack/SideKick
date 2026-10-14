# Hackathon Submission — Requirements & Checklist

**Event:** Amazon Developer Hackathon 2026 ("Build, Ship, Shape")
**Track:** Bee (Wearable AI) — primary. **Mini challenges:** none.
**Deadline:** 24 Oct 2026 @ 12:30am GMT+5:30.
**Project:** SideKick (see [IDEA.md](IDEA.md)).

---

## Track requirements (Bee)

- Integrate Bee's **CLI, MCP, or Agent Skills** with other services, devices, or developer tools.
- Priority use cases: education, developer experience, **personal productivity**.
- The repo must **actually call** Bee in code (import / entry point / loaded config), not a
  README-only mention.
- The demo video and code must show the project using **live Bee data** to do something useful
  for a person. (You do **not** need to let other users connect to Bee through the project.)

SideKick satisfies the code requirement via: SSE ingestion of the live stream, neural search +
facts reads for identification/context, and a `todos create` write-back.

---

## Submission checklist

- [ ] **Text description** — what SideKick does and how it works.
- [ ] **GitHub repository** — all source, assets, and run instructions. Either:
  - [ ] Public **and** open source (includes the [LICENSE](../LICENSE) file), **OR**
  - [ ] Private **and** shared with `testing@devpost.com` **and** the Amazon reviewers below.
- [ ] **Demo video** — under 3 minutes, YouTube or Vimeo, public, in English. Shows SideKick
      running on **live Bee data**.
- [ ] **Product feedback** — for every Bee tool/API/SDK used (template below).
- [ ] **Track(s) declared** — Bee. Mini challenges: none.
- [ ] **If pre-existing** — N/A (SideKick is new, built during the submission window).
- [ ] *(Optional)* Feature requests.
- [ ] *(Optional)* Friction log — can earn up to a **10% judging bonus** (template below).

---

## Amazon reviewers (add as GitHub collaborators only if the repo is private)

Add at submission time — GitHub invitations expire after 7 days and each person must accept.

- Chris Traganos — https://github.com/chris-trag
- Kourtney Meiss — https://github.com/knmeiss
- Giovanni Laquidara — https://github.com/giolaq
- Anisha Malde — https://github.com/anishamalde
- Moses Roth — https://github.com/mosesroth
- Emerson Sklar — https://github.com/emersonsklar
- Also share with `testing@devpost.com`.

> If the repo is **public + MIT**, collaborator invitations are not required.

---

## Judging criteria (design the demo around these)

| Criterion | How SideKick addresses it |
| --- | --- |
| **Tech Implementation** | Deep Bee use: real-time SSE + facts + conversations + neural search + todo write-back. |
| **Design** | One intuitive loop: talk → recognized → glance card → follow-up. |
| **Potential Impact** | Networkers + a strong accessibility audience (face-blindness, memory, social anxiety). |
| **Quality of the Idea** | Built on capabilities only Bee exposes (passive multi-party capture + real-time). |

---

## Product feedback, friction log, feature requests

Maintained per Bee tool (CLI, Node library, SSE stream, neural search, todos, MCP, Agent Skill) in
[BEE-FEEDBACK.md](BEE-FEEDBACK.md). Log friction **as it happens**, not at the end.

- **Product feedback** (each tool): what it was used for, what worked well, what needs work,
  onboarding, would you build with it again.
- **Friction log** (each entry, up to 10% bonus): task attempted, steps taken, expected vs.
  actual, severity, workaround, actionable suggestion.
- **Feature requests** (optional): what, why it matters, urgency (critical / important /
  nice-to-have).
