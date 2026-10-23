# SideKick

**Your real-time social memory — powered by Bee.**

SideKick listens to your live conversations through [Bee](https://www.bee.computer/),
recognizes who you're talking to, and discreetly surfaces a glanceable card — who they
are, your history together, and any open promises between you — before the handshake
ends. After the conversation, it writes follow-up todos back into Bee.

---

## Why SideKick is only possible with Bee

SideKick passes two tests that rule out every phone voice assistant and even Bee's own app:

1. **Could a chat or voice assistant ever have had this input?** No. SideKick is built on what *other people*
   say in real, in-person conversations you never recorded on purpose. A phone assistant
   only hears what you deliberately say *to it*; Bee passively captures multi-party
   conversations with speaker identification.
2. **Does Bee's own app already do this?** No. Bee *stores* transcripts, facts, and history,
   but it never *pushes them to you live, mid-conversation.* SideKick is the real-time
   action layer Bee deliberately leaves to developers.

Bee data already comes from the **Apple Watch**, and the watch is the ideal discreet surface
for an in-the-moment whisper — the data source and the output live on the same device.

---

## What it does

When someone starts talking to you, SideKick shows a card with:

1. **Who** — name, role, organization.
2. **How you know them** — where you met, who introduced you.
3. **Last time** — when you last spoke and about what.
4. **Open loops** — promises you owe them, or they owe you.
5. **Don't forget / avoid** — things to raise, topics to steer around.
6. **Name rescue** — the quiet save when you've blanked.

After the conversation it suggests a follow-up and writes a todo back into Bee.

---

## How it works

```
Apple Watch (Bee)  ──live audio──▶  Bee cloud  ──SSE stream──▶  SideKick
                                                                   │
        ┌──────────────────────────────────────────────────────────┤
        ▼                 ▼                    ▼                     ▼
  Identify person   Assemble context     Extract open loops    Deliver card
  (name-from-speech  (facts, last         (two-sided           (web/watch
   + semantic match)  conversation)        commitments)         glance UI)
                                                                   │
                                                          After the chat:
                                                      write follow-up todo → Bee
```

SideKick consumes Bee's **real-time SSE stream** (`new-utterance`, `new-conversation`),
identifies the person via name-from-speech plus semantic search over your Bee **facts** and
**past conversations**, assembles a card, and (after the chat) writes a follow-up **todo**
back into Bee.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full design and
[docs/BEE-INTEGRATION.md](docs/BEE-INTEGRATION.md) for the exact Bee calls used.

---

## Getting started

### Prerequisites

- Node.js 22.13+ (uses the built-in `node:sqlite`)
- A Bee account with the latest Bee app, and **Developer Mode enabled**
  (tap the app version 5 times in Settings).
- An Apple Watch running Bee software (the data source).
- AWS credentials with Amazon Bedrock model access (Claude Sonnet or Nova).
- Xcode 15+ and [XcodeGen](https://github.com/yonaskolb/XcodeGen) for the watch app.

### Backend

```bash
npm install                # also installs the Bee CLI locally (@beeai/cli)
npx bee login              # authenticate with Bee
npx bee status

cp .env.example .env       # set SIDEKICK_TOKEN (openssl rand -hex 32), AWS_PROFILE, AWS_REGION
npm run dev                # live Bee stream → identification → card API on 127.0.0.1:8787
```

Open `http://127.0.0.1:8787/` for a debug view of the card (paste the token).

### Record and replay real Bee events

```bash
npm run record                                   # writes fixtures/recording-<time>.jsonl
SIDEKICK_REPLAY_FILE=fixtures/<file>.jsonl npm run replay
```

Replay swaps only the live stream; facts, neural search, and todo write-back still hit Bee.

### Apple Watch app

The watch long-polls the server over HTTPS, so expose the server through an HTTPS tunnel
(e.g. `cloudflared tunnel --url http://127.0.0.1:8787`).

```bash
cd watch
cp Secrets.xcconfig.example Secrets.xcconfig     # team id, bundle id, tunnel URL, token
xcodegen                                          # generates SideKick.xcodeproj
open SideKick.xcodeproj                           # run the SideKick scheme on your watch
```

### Tests

```bash
npm test && npm run typecheck
```

### Deploy to AWS (EC2)

On an Amazon Linux 2023 instance with an Elastic IP, ports 80/443 open, and an instance role
allowing `bedrock:InvokeModel`:

```bash
sudo dnf install -y git
git clone https://github.com/<you>/sidekick.git && cd sidekick
sudo bash deploy/ec2-setup.sh                         # prints https://<ip>.sslip.io
cd /opt/sidekick/app && sudo -u sidekick -H npx bee login
sudo systemctl restart sidekick && sudo journalctl -u sidekick -f
sudo grep SIDEKICK_TOKEN /etc/sidekick.env            # token for the watch / debug page
```

Update later with `sudo sidekick-update` (git pull + restart).

### Verify Bee data is flowing

```bash
bee now               # recent conversations from the last 10 hours
bee stream --agent    # live event stream — speak near your watch to see utterances
```

---

## Documentation

- [docs/IDEA.md](docs/IDEA.md) — the concept, differentiation, and demo flow.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — components, data flow, and design decisions.
- [docs/BEE-INTEGRATION.md](docs/BEE-INTEGRATION.md) — Bee CLI/MCP/API reference used by SideKick.
- [docs/BEE-FEEDBACK.md](docs/BEE-FEEDBACK.md) — product feedback, friction log, and feature requests per Bee tool.

---

## License

[MIT](LICENSE)
