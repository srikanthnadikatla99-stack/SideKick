import { test } from "node:test";
import assert from "node:assert/strict";
import { CardAssembler } from "../src/context/assembler.ts";
import type { LlmProvider } from "../src/llm/provider.ts";
import { Store } from "../src/store/db.ts";
import { fakeBee } from "./fakes.ts";

test("card still shows the recognized name when the LLM is unavailable", async () => {
  const failing: LlmProvider = {
    json: async () => {
      throw new Error("Could not load credentials from any providers");
    },
    text: async () => {
      throw new Error("Could not load credentials from any providers");
    },
  };
  const assembler = new CardAssembler({ bee: fakeBee().bee, llm: failing, store: new Store(":memory:") });
  const card = await assembler.assemble(
    { conversationUuid: "c1", utterances: [], startedAt: 0 },
    { person: null, inferredName: "Sarah Chen", confidence: 0.6, confirmed: false, evidence: [] },
  );
  assert.equal(card.inferredName, "Sarah Chen");
  assert.equal(card.confidence, 0.6);
  assert.deepEqual(card.openLoops, []);
  assert.equal(card.pending, false);
});
