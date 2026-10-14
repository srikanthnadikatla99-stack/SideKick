import { test } from "node:test";
import assert from "node:assert/strict";
import { extractNameMentions, topicKeywords } from "../src/identify/nameFromSpeech.ts";

const u = (speaker: string, text: string) => ({ speaker, text, at: 0 });

test("detects self-introductions with full names", () => {
  const mentions = extractNameMentions([u("speaker_2", "Hi, I'm Sarah Chen, we met in Lisbon.")]);
  assert.deepEqual(mentions, [{ name: "Sarah Chen", kind: "self", speaker: "speaker_2" }]);
});

test("detects direct address", () => {
  const mentions = extractNameMentions([u("speaker_1", "Hey Priya, good to see you")]);
  assert.deepEqual(mentions, [{ name: "Priya", kind: "addressed", speaker: "speaker_1" }]);
});

test("ignores lowercase followers and filler words", () => {
  assert.deepEqual(extractNameMentions([u("s", "I'm going to grab coffee. This is great. I'm Sorry")]), []);
});

test("excludes the wearer's own name", () => {
  assert.deepEqual(extractNameMentions([u("s", "Thanks Alex, my name is Alex")], ["Alex"]), []);
});

test("topic keywords skip stopwords and rank by frequency", () => {
  const words = topicKeywords([u("a", "The onboarding doc for Northwind hiring"), u("b", "Northwind hiring is slow")]);
  assert.deepEqual(words.slice(0, 2), ["northwind", "hiring"]);
  assert.ok(!words.includes("the"));
});
