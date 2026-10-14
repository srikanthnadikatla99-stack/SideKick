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
    utterance: { speaker: "speaker_1", text: "Hello", at: 5 },
  });
  assert.equal(normalizeEvent("new-conversation", { conversation: { id: 1, uuid: "u1" } })?.kind, "conversation-open");
  assert.equal(normalizeEvent("update-conversation", { conversation: { id: 1, state: "processing" } }), null);
  assert.equal(normalizeEvent("update-conversation", { conversation: { id: 1, state: "processed" } })?.kind, "conversation-processed");
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
