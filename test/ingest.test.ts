import { test } from "node:test";
import assert from "node:assert/strict";
import { normalized, normalizeEvent, replayRawEvents } from "../src/ingest/beeStream.ts";
import { SessionStore } from "../src/ingest/sessions.ts";
import { findConversationIds } from "../src/bee/client.ts";

const FIXTURE = new URL("./fixtures/synthetic.jsonl", import.meta.url).pathname;

test("normalizes the three stream event types", () => {
  assert.deepEqual(normalizeEvent("new-utterance", { utterance: { text: "Hello", speaker: "speaker_1" }, conversation_uuid: "u1" }, 5), {
    kind: "utterance",
    conversationUuid: "u1",
    utterance: { speaker: "speaker_1", text: "Hello", at: 5, offset: undefined },
  });
  assert.equal(normalizeEvent("new-conversation", { conversation: { id: 1, uuid: "u1" } })?.kind, "conversation-open");
  assert.equal(normalizeEvent("update-conversation", { conversation: { id: 1, state: "processing" } }), null);
  assert.equal(normalizeEvent("update-conversation", { conversation: { id: 1, state: "processed" } })?.kind, "conversation-processed");
});

// Shapes copied from a real recording of Bee's live stream (Apple Watch, Oct 2026).
const realUtterance = (start: number, text: string, spokenAt: string) => ({
  type: "new-utterance",
  conversation_uuid: "219749a8",
  utterance: { id: 1, sample_id: "s", start, end: start + 2, text, spoken_at: spokenAt },
});

test("real Bee events: ISO spoken_at, keep-alives ignored, out-of-order utterances re-sorted", () => {
  assert.equal(normalizeEvent("new-utterance", { timestamp: 1792658844087 }), null);
  const sessions = new SessionStore();
  for (const data of [
    realUtterance(3.76, "Good to finally catch up.", "2026-10-22T09:19:10.000Z"),
    realUtterance(6.64, "Hey, I'm good.", "2026-10-22T09:19:13.000Z"),
    realUtterance(1.68, "Hi Riya, how are you?", "2026-10-22T09:19:08.000Z"),
  ]) {
    const event = normalizeEvent("new-utterance", data)!;
    assert.equal(event.kind === "utterance" && event.utterance.at, Date.parse(data.utterance.spoken_at));
    sessions.apply(event);
  }
  assert.deepEqual(
    sessions.get("219749a8")!.utterances.map((u) => u.text),
    ["Hi Riya, how are you?", "Good to finally catch up.", "Hey, I'm good."],
  );
});

test("replay + session store link processed events back to the conversation by id", async () => {
  const sessions = new SessionStore();
  const kinds: string[] = [];
  for await (const event of normalized(replayRawEvents(FIXTURE, 1000))) {
    const session = sessions.apply(event);
    kinds.push(event.kind);
    if (event.kind === "conversation-processed") {
      assert.equal(session?.conversationUuid, "conv-a");
      assert.equal(session?.utterances.length, 3);
    }
  }
  assert.deepEqual(kinds, ["conversation-open", "utterance", "utterance", "utterance", "conversation-processed"]);
});

test("finds conversation ids in arbitrary search responses", () => {
  assert.deepEqual(findConversationIds({ conversations: [{ id: 7 }, { id: 9 }], meta: { id: 1 } }), [7, 9]);
  assert.deepEqual(findConversationIds({ results: [{ conversation_id: 3 }] }), [3]);
});
