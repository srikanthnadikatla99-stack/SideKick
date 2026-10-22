import { test } from "node:test";
import assert from "node:assert/strict";
import { isIdle } from "../src/notify/idle.ts";
import { NtfyNotifier, type Notifier } from "../src/notify/ntfy.ts";
import { CardAssembler } from "../src/context/assembler.ts";
import { Hub } from "../src/hub.ts";
import { Identifier } from "../src/identify/identifier.ts";
import { normalized, replayRawEvents } from "../src/ingest/beeStream.ts";
import { SessionStore } from "../src/ingest/sessions.ts";
import { Pipeline } from "../src/pipeline.ts";
import { Store } from "../src/store/db.ts";
import type { Card } from "../src/types.ts";
import { fakeBee, fakeLlm } from "./fakes.ts";

const FIXTURE = new URL("./fixtures/synthetic.jsonl", import.meta.url).pathname;

function captureFetch() {
  const calls: { url: string; headers: Record<string, string>; body: Record<string, any> }[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  return { calls, fetchFn };
}

const card: Card = {
  conversationUuid: "c1",
  person: null,
  inferredName: "Sarah Chen",
  confidence: 0.85,
  confirmed: false,
  role: "Head of Design",
  org: "Northwind",
  evidence: [],
  pending: false,
  openLoops: [{ direction: "you_owe", text: "Send Sarah the onboarding doc" }],
  dontForget: [],
  avoid: [],
  updatedAt: "",
};

test("ntfy card notification carries the open loop and authenticated confirm/reject actions", async () => {
  const { calls, fetchFn } = captureFetch();
  const notifier = new NtfyNotifier({
    url: "http://127.0.0.1:2586",
    topic: "sk-topic",
    token: "tk_ntfy",
    publicUrl: "https://sk.example",
    apiToken: "api-token",
    fetch: fetchFn,
  });
  await notifier.personRecognized(card);
  const [call] = calls;
  assert.equal(call!.headers["Authorization"], "Bearer tk_ntfy");
  assert.equal(call!.body.topic, "sk-topic");
  assert.equal(call!.body.title, "Sarah Chen");
  assert.match(call!.body.message, /You owe: Send Sarah the onboarding doc/);
  const [yes, no] = call!.body.actions;
  assert.equal(yes.url, "https://sk.example/api/confirm");
  assert.equal(yes.headers.Authorization, "Bearer api-token");
  assert.deepEqual(JSON.parse(yes.body), { conversationUuid: "c1", name: "Sarah Chen" });
  assert.equal(no.url, "https://sk.example/api/reject");
});

test("confirmed cards are sent without confirm buttons", async () => {
  const { calls, fetchFn } = captureFetch();
  const notifier = new NtfyNotifier({ url: "http://n", topic: "t", token: "k", publicUrl: "https://sk", apiToken: "a", fetch: fetchFn });
  await notifier.personRecognized({ ...card, confirmed: true });
  assert.deepEqual(calls[0]!.body.actions, []);
});

test("pipeline notifies once per person, after the full card, then sends the follow-up", async () => {
  const sent: string[] = [];
  const notifier: Notifier = {
    personRecognized: async (c) => void sent.push(`card:${c.inferredName}:${c.pending}`),
    followUpReady: async (f, name) => void sent.push(`followup:${name}`),
    beeIdle: async () => {},
  };
  const store = new Store(":memory:");
  const { bee } = fakeBee();
  const { llm } = fakeLlm();
  const pipeline = new Pipeline({
    sessions: new SessionStore(),
    identifier: new Identifier({ store, bee, llm, ownerNames: [] }),
    assembler: new CardAssembler({ bee, llm, store }),
    store,
    bee,
    llm,
    hub: new Hub(),
    notifier,
  });
  for await (const event of normalized(replayRawEvents(FIXTURE, 1000))) {
    if (event.kind === "conversation-processed") await new Promise((r) => setTimeout(r, 1300));
    await pipeline.handle(event);
  }
  assert.deepEqual(sent, ["card:Sarah Chen:false", "followup:Sarah Chen"]);
});

test("idle alert only fires during active hours after the silence threshold", () => {
  const cfg = { hours: "9-19", timeZone: "UTC", afterMinutes: 120 };
  const noon = Date.UTC(2026, 9, 22, 12, 0);
  assert.equal(isIdle(noon, noon - 3 * 3_600_000, cfg), true);
  assert.equal(isIdle(noon, noon - 30 * 60_000, cfg), false);
  const night = Date.UTC(2026, 9, 22, 23, 0);
  assert.equal(isIdle(night, night - 5 * 3_600_000, cfg), false);
});
