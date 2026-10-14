import type { BeeGateway } from "../bee/client.ts";
import { compactJson } from "../bee/client.ts";
import type { LiveSession } from "../ingest/sessions.ts";
import { transcriptText } from "../ingest/sessions.ts";
import type { LlmProvider } from "../llm/provider.ts";
import type { Store } from "../store/db.ts";
import type { Identification, Person } from "../types.ts";
import { extractNameMentions, topicKeywords } from "./nameFromSpeech.ts";

export type IdentifierDeps = {
  store: Store;
  bee: BeeGateway;
  llm: LlmProvider;
  /** The wearer's own names, never reported as the other person. */
  ownerNames: string[];
};

type SemanticGuess = { name: string | null; confidence: number; evidence: string };
type Candidate = { name: string; score: number; evidence: string[] };

const SEMANTIC_EVERY_N_UTTERANCES = 3;
const SKIP_SEMANTIC_ABOVE = 0.85;

const SEMANTIC_SYSTEM = `You identify who the wearer of a Bee wearable is talking to right now.
You get: the live transcript (speaker labels are per-conversation, not names), Bee neural search hits
over the wearer's past conversations, Bee facts about the wearer's life, and people already known.
Pick the single most likely person the wearer is speaking with, or null if the evidence is weak.
Never return the wearer themselves. Confidence is 0..1 and must reflect real evidence, not guesses.
Schema: {"name": string|null, "confidence": number, "evidence": string}`;

const key = (name: string) => name.trim().toLowerCase();

export class Identifier {
  private semantic = new Map<string, { atCount: number; guess?: SemanticGuess }>();
  private rejected = new Map<string, Set<string>>();

  constructor(private deps: IdentifierDeps) {}

  async identify(session: LiveSession): Promise<Identification> {
    const { store } = this.deps;
    const link = store.getConversationLink(session.conversationUuid);
    if (link?.confirmed) {
      const person = store.getPerson(link.personId);
      if (person) return { person, confidence: 1, confirmed: true, evidence: ["Confirmed by you"] };
    }

    const rejected = this.rejected.get(session.conversationUuid) ?? new Set<string>();
    const candidates = new Map<string, Candidate>();
    // Noisy-OR: independent signals reinforce each other without exceeding 1.
    const add = (name: string, score: number, evidence: string) => {
      if (score <= 0 || rejected.has(key(name))) return;
      const resolved = store.findPersonByName(name)?.name ?? name;
      const c = candidates.get(key(resolved)) ?? { name: resolved, score: 0, evidence: [] };
      c.score = 1 - (1 - c.score) * (1 - Math.min(score, 0.95));
      c.evidence.push(evidence);
      candidates.set(key(resolved), c);
    };

    for (const m of extractNameMentions(session.utterances, this.deps.ownerNames)) {
      add(
        m.name,
        m.kind === "self" ? 0.6 : 0.45,
        m.kind === "self" ? `${m.speaker} introduced themselves as ${m.name}` : `${m.speaker} addressed ${m.name}`,
      );
    }

    const keywords = new Set(topicKeywords(session.utterances, 30));
    const cueHits = new Map<string, { weight: number; cues: string[] }>();
    for (const { personId, cue, weight } of store.allCues()) {
      if (!keywords.has(cue)) continue;
      const hit = cueHits.get(personId) ?? { weight: 0, cues: [] };
      hit.weight += weight;
      hit.cues.push(cue);
      cueHits.set(personId, hit);
    }
    for (const [personId, hit] of cueHits) {
      const person = store.getPerson(personId);
      if (person) add(person.name, Math.min(0.5, 0.08 * hit.weight), `Topics you've discussed before: ${hit.cues.slice(0, 4).join(", ")}`);
    }

    const bestSoFar = Math.max(0, ...[...candidates.values()].map((c) => c.score));
    const guess = await this.semanticGuess(session, bestSoFar, [...keywords]);
    if (guess?.name) add(guess.name, guess.confidence * 0.7, guess.evidence);

    const best = [...candidates.values()].sort((a, b) => b.score - a.score)[0];
    if (!best) return { person: null, confidence: 0, confirmed: false, evidence: [] };
    const person = store.findPersonByName(best.name) ?? null;
    return {
      person,
      inferredName: person ? undefined : best.name,
      confidence: Number(best.score.toFixed(2)),
      confirmed: false,
      evidence: best.evidence,
    };
  }

  /** Confirm-and-learn: persist the person, link this conversation, and remember its topics as cues. */
  confirm(session: LiveSession, input: { personId?: string; name?: string }): Person {
    const { store } = this.deps;
    const person = input.personId ? store.getPerson(input.personId) : input.name ? store.upsertPerson({ name: input.name }) : undefined;
    if (!person) throw new Error("Unknown person");
    store.linkConversation(session.conversationUuid, person.id, true);
    const nameParts = new Set(person.name.toLowerCase().split(/\s+/));
    store.addCues(person.id, topicKeywords(session.utterances, 12).filter((cue) => !nameParts.has(cue)));
    this.rejected.delete(session.conversationUuid);
    return person;
  }

  reject(session: LiveSession, name: string): void {
    const set = this.rejected.get(session.conversationUuid) ?? new Set<string>();
    set.add(key(name));
    this.rejected.set(session.conversationUuid, set);
  }

  forget(conversationUuid: string): void {
    this.semantic.delete(conversationUuid);
    this.rejected.delete(conversationUuid);
  }

  private async semanticGuess(session: LiveSession, bestSoFar: number, keywords: string[]): Promise<SemanticGuess | undefined> {
    const cached = this.semantic.get(session.conversationUuid);
    const count = session.utterances.length;
    const due = !cached || count - cached.atCount >= SEMANTIC_EVERY_N_UTTERANCES;
    if (!due || bestSoFar >= SKIP_SEMANTIC_ABOVE) return cached?.guess;

    this.semantic.set(session.conversationUuid, { atCount: count, guess: cached?.guess });
    const { bee, llm, store, ownerNames } = this.deps;
    const query = session.utterances.slice(-8).map((u) => u.text).join(" ").slice(0, 500);
    const [hits, facts] = await Promise.allSettled([
      bee.neuralSearch(query, { limit: 5 }),
      keywords.length > 0 ? bee.searchFacts(keywords.slice(0, 6).join(" "), 10) : Promise.resolve(null),
    ]);
    const known = store.listPeople().slice(0, 50).map((p) => [p.name, p.role, p.org].filter(Boolean).join(", "));
    const prompt = [
      `Wearer: ${ownerNames.join(" / ") || "unknown"}`,
      `Live transcript:\n${transcriptText(session.utterances, 20)}`,
      `Neural search hits:\n${hits.status === "fulfilled" ? compactJson(hits.value, 5000) : "unavailable"}`,
      `Facts:\n${facts.status === "fulfilled" ? compactJson(facts.value, 2500) : "unavailable"}`,
      `Known people:\n${known.join("\n") || "none"}`,
    ].join("\n\n");

    try {
      const guess = await llm.json<SemanticGuess>(SEMANTIC_SYSTEM, prompt, { maxTokens: 300 });
      const clean: SemanticGuess = {
        name: typeof guess.name === "string" && guess.name.trim() ? guess.name.trim() : null,
        confidence: Math.max(0, Math.min(1, Number(guess.confidence) || 0)),
        evidence: String(guess.evidence ?? "Matched against your past conversations"),
      };
      this.semantic.set(session.conversationUuid, { atCount: count, guess: clean });
      return clean;
    } catch (error) {
      console.warn("[identify] semantic match failed:", (error as Error).message);
      return cached?.guess;
    }
  }
}
