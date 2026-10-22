import { test } from "node:test";
import assert from "node:assert/strict";
import { Identifier } from "../src/identify/identifier.ts";
import { Store } from "../src/store/db.ts";
import type { LiveSession } from "../src/ingest/sessions.ts";
import { fakeBee, fakeLlm } from "./fakes.ts";

const session = (uuid: string, lines: [string, string][]): LiveSession => ({
  conversationUuid: uuid,
  utterances: lines.map(([speaker, text], i) => ({ speaker, text, at: i })),
  startedAt: 0,
});

test("infers an unknown person from a self-introduction", async () => {
  const store = new Store(":memory:");
  const id = new Identifier({ store, bee: fakeBee().bee, llm: fakeLlm().llm, ownerNames: ["Alex"] });
  const result = await id.identify(session("c1", [["speaker_2", "Hi, I'm Sarah Chen"]]));
  assert.equal(result.person, null);
  assert.equal(result.inferredName, "Sarah Chen");
  assert.ok(result.confidence >= 0.6);
});

test("confirm-and-learn: later conversations match on learned topics without a name", async () => {
  const store = new Store(":memory:");
  const id = new Identifier({ store, bee: fakeBee().bee, llm: fakeLlm().llm, ownerNames: ["Alex"] });
  const first = session("c1", [
    ["speaker_2", "Hi, I'm Sarah Chen"],
    ["speaker_2", "Northwind design hiring and the onboarding rollout are my focus"],
  ]);
  const sarah = id.confirm(first, { name: "Sarah Chen" });
  assert.equal((await id.identify(first)).confirmed, true);

  const second = session("c2", [["speaker_2", "Quick update on Northwind hiring and onboarding rollout"]]);
  const result = await id.identify(second);
  assert.equal(result.person?.id, sarah.id);
  assert.ok(result.confidence > 0);
});

test("semantic guess identifies a person when nobody says a name", async () => {
  const store = new Store(":memory:");
  const { llm, calls } = fakeLlm({ semanticName: "Sarah Chen" });
  const id = new Identifier({ store, bee: fakeBee().bee, llm, ownerNames: [] });
  const result = await id.identify(session("c3", [["speaker_2", "Did the onboarding doc ever get finished?"]]));
  assert.equal(result.inferredName, "Sarah Chen");
  assert.deepEqual(calls, ["identify"]);
});

test("rejecting a candidate removes it for that conversation", async () => {
  const store = new Store(":memory:");
  const id = new Identifier({ store, bee: fakeBee().bee, llm: fakeLlm().llm, ownerNames: [] });
  const s = session("c4", [["speaker_2", "Hi, I'm Sarah"]]);
  id.reject(s, "Sarah");
  assert.equal((await id.identify(s)).inferredName, undefined);
});

test("ASR spelling variants of one name merge into a single, stronger candidate", async () => {
  const store = new Store(":memory:");
  const id = new Identifier({ store, bee: fakeBee().bee, llm: fakeLlm({ semanticName: "Ria" }).llm, ownerNames: ["Srikanth"] });
  const result = await id.identify(
    session("c5", [
      ["unknown", "Hi Riya, how are you?"],
      ["unknown", "Great talking to you, Ria."],
    ]),
  );
  assert.match(result.inferredName ?? "", /^Ri(y)?a$/);
  assert.ok(result.confidence > 0.6, `merged confidence ${result.confidence}`);
});

test("a single shared topic word is too weak to name someone", async () => {
  const store = new Store(":memory:");
  const id = new Identifier({ store, bee: fakeBee().bee, llm: fakeLlm().llm, ownerNames: [] });
  id.confirm(session("old", [["speaker_2", "Hi, I'm Sarah Chen. Northwind onboarding is my focus"]]), { name: "Sarah Chen" });
  const result = await id.identify(session("new", [["unknown", "Good to finally catch up about Northwind."]]));
  assert.equal(result.person, null);
  assert.equal(result.inferredName, undefined);
});

test("stored people are found despite spelling variants", () => {
  const store = new Store(":memory:");
  store.upsertPerson({ name: "Riya" });
  assert.equal(store.findPersonByName("Ria")?.name, "Riya");
  assert.equal(store.findPersonByName("Rhea")?.name, "Riya");
  assert.equal(store.findPersonByName("Rahul"), undefined);
  assert.ok(store.deletePerson("Riya"));
  assert.equal(store.listPeople().length, 0);
});
