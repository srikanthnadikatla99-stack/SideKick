import { test } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { CardAssembler } from "../src/context/assembler.ts";
import { Hub } from "../src/hub.ts";
import { Identifier } from "../src/identify/identifier.ts";
import { normalized, replayRawEvents } from "../src/ingest/beeStream.ts";
import { SessionStore } from "../src/ingest/sessions.ts";
import { Pipeline } from "../src/pipeline.ts";
import { createApiServer } from "../src/server.ts";
import { Store } from "../src/store/db.ts";
import { fakeBee, fakeLlm } from "./fakes.ts";

const FIXTURE = new URL("./fixtures/synthetic.jsonl", import.meta.url).pathname;
const TOKEN = "t".repeat(40);

function build() {
  const store = new Store(":memory:");
  const { bee, todos } = fakeBee();
  const { llm } = fakeLlm();
  const hub = new Hub();
  const pipeline = new Pipeline({
    sessions: new SessionStore(),
    identifier: new Identifier({ store, bee, llm, ownerNames: ["Alex"] }),
    assembler: new CardAssembler({ bee, llm, store }),
    store,
    bee,
    llm,
    hub,
  });
  return { store, hub, pipeline, todos };
}

test("rehearsal: a known person is rescued without their name being said", async () => {
  const store = new Store(":memory:");
  const riya = store.upsertPerson({ name: "Riya" });
  store.addCues(riya.id, ["northwind", "marathon", "mango", "coffee", "bouldering", "onboarding"]);
  const { bee } = fakeBee();
  // Semantic search can't find her here, so this exercises the learned-topic path alone.
  const { llm } = fakeLlm({ semanticName: null });
  const hub = new Hub();
  const pipeline = new Pipeline({
    sessions: new SessionStore(),
    identifier: new Identifier({ store, bee, llm, ownerNames: ["Srikanth"] }),
    assembler: new CardAssembler({ bee, llm, store }),
    store,
    bee,
    llm,
    hub,
  });
  const rehearsal = new URL("./fixtures/rehearsal-recall.jsonl", import.meta.url).pathname;
  let namedAtLine = -1;
  let lines = 0;
  for await (const event of normalized(replayRawEvents(rehearsal, 1000))) {
    if (event.kind === "conversation-processed") break;
    await pipeline.handle(event);
    if (event.kind === "utterance") lines++;
    await new Promise((r) => setTimeout(r, 1300));
    if (namedAtLine === -1 && hub.current().card?.person?.name === "Riya") namedAtLine = lines;
  }
  assert.ok(namedAtLine > 0 && namedAtLine <= 6, `named after ${namedAtLine} lines`);
});

test("replay produces a card with open loops, then a follow-up written back to Bee", async () => {
  const { hub, pipeline, todos } = build();
  let sawCard = false;
  for await (const event of normalized(replayRawEvents(FIXTURE, 1000))) {
    if (event.kind === "conversation-processed") {
      // Let the debounced refresh land before the conversation closes.
      await new Promise((r) => setTimeout(r, 1300));
      const card = hub.current().card!;
      assert.equal(card.inferredName, "Sarah Chen");
      assert.equal(card.howYouMet, "Lisbon conference");
      assert.deepEqual(card.openLoops, [{ direction: "you_owe", text: "Send Sarah the onboarding doc", sourceConversationId: 42 }]);
      sawCard = true;
    }
    await pipeline.handle(event);
  }
  assert.ok(sawCard);

  const followUp = hub.current().followUp!;
  assert.equal(followUp.text, "Send Sarah Chen the onboarding doc");
  const approved = await pipeline.approveFollowUp(followUp.id);
  assert.equal(approved.status, "approved");
  assert.equal(approved.beeTodoId, "901");
  assert.deepEqual(todos, ["Send Sarah Chen the onboarding doc"]);
  assert.equal(hub.current().followUp, null);

  // People often tap "Yes" after the conversation has already been processed.
  await pipeline.confirm("conv-a", { name: "Sarah Chen" });
  assert.equal(hub.current().card?.confirmed, true);
  assert.equal(hub.current().card?.person?.name, "Sarah Chen");
});

test("a name-only card is published before the slow LLM pass finishes", async () => {
  const store = new Store(":memory:");
  const { bee } = fakeBee();
  const { llm: fast } = fakeLlm();
  let release!: () => void;
  const gate = new Promise<void>((r) => (release = r));
  const llm = { ...fast, json: async <T>(s: string, u: string) => (await gate, fast.json<T>(s, u)) };
  const hub = new Hub();
  const pipeline = new Pipeline({
    sessions: new SessionStore(),
    identifier: new Identifier({ store, bee, llm, ownerNames: [] }),
    assembler: new CardAssembler({ bee, llm, store }),
    store,
    bee,
    llm,
    hub,
  });
  await pipeline.handle({ kind: "utterance", conversationUuid: "c9", utterance: { speaker: "speaker_2", text: "Hi, I'm Sarah Chen", at: 0 } });
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(hub.current().card?.inferredName, "Sarah Chen");
  assert.equal(hub.current().card?.howYouMet, undefined);
  assert.equal(hub.current().card?.pending, true);
  release();
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(hub.current().card?.howYouMet, "Lisbon conference");
  assert.equal(hub.current().card?.role, "Head of Design");
  assert.equal(hub.current().card?.pending, false);
});

test("API requires the bearer token and serves long-poll state", async (t) => {
  const { hub, pipeline } = build();
  const server = createApiServer({ hub, pipeline, token: TOKEN });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;

  assert.equal((await fetch(`${base}/api/state`)).status, 401);
  assert.equal((await fetch(`${base}/api/state`, { headers: { Authorization: "Bearer wrong" } })).status, 401);

  const auth = { Authorization: `Bearer ${TOKEN}` };
  const waiting = fetch(`${base}/api/state?since=0&wait=5`, { headers: auth }).then((r) => r.json());
  setTimeout(() => hub.publish({ card: null }), 50);
  assert.equal((await waiting).version, 1);

  const bad = await fetch(`${base}/api/confirm`, { method: "POST", headers: auth, body: "[]" });
  assert.equal(bad.status, 400);
  const missing = await fetch(`${base}/api/confirm`, {
    method: "POST",
    headers: auth,
    body: JSON.stringify({ conversationUuid: "nope", name: "Sarah" }),
  });
  assert.equal(missing.status, 409);
});
