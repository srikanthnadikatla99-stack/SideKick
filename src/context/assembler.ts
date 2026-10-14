import type { BeeGateway } from "../bee/client.ts";
import { compactJson, findConversationIds } from "../bee/client.ts";
import type { LiveSession } from "../ingest/sessions.ts";
import type { LlmProvider } from "../llm/provider.ts";
import { OPEN_LOOP_RULES, normalizeOpenLoops } from "../loops/promises.ts";
import type { Store } from "../store/db.ts";
import type { Card, Identification, OpenLoop } from "../types.ts";

type PersonContext = {
  role?: string;
  org?: string;
  howYouMet?: string;
  lastSpoke?: { when: string; topic: string };
  openLoops: OpenLoop[];
  dontForget: string[];
  avoid: string[];
};

const CONTEXT_TTL_MS = 10 * 60 * 1000;

const SYSTEM = `You prepare a glanceable briefing card about a person the wearer of a Bee wearable is talking to right now.
Use only the evidence given (Bee facts, past conversations, todos). Be terse: each string under 90 characters.
${OPEN_LOOP_RULES}
dontForget: things worth raising with them now. avoid: sensitive topics to steer around. Empty arrays are fine.
lastSpoke.when is human-friendly relative time (e.g. "3 weeks ago"), computed from timestamps against now.
Schema: {"role": string|null, "org": string|null, "howYouMet": string|null,
 "lastSpoke": {"when": string, "topic": string}|null,
 "openLoops": [{"direction": "you_owe"|"they_owe", "text": string, "sourceConversationId": number|null}],
 "dontForget": string[], "avoid": string[]}`;

const strOrUndef = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
const strList = (v: unknown) => (Array.isArray(v) ? v.filter((s): s is string => typeof s === "string" && !!s.trim()).slice(0, 3) : []);

export class CardAssembler {
  private cache = new Map<string, { at: number; context: PersonContext }>();

  constructor(private deps: { bee: BeeGateway; llm: LlmProvider; store: Store }) {}

  async assemble(session: LiveSession, identification: Identification): Promise<Card> {
    const name = identification.person?.name ?? identification.inferredName;
    const base: Card = {
      conversationUuid: session.conversationUuid,
      person: identification.person,
      inferredName: identification.inferredName,
      confidence: identification.confidence,
      confirmed: identification.confirmed,
      openLoops: [],
      dontForget: [],
      avoid: [],
      updatedAt: new Date().toISOString(),
    };
    if (!name) return base;

    const context = await this.personContext(name, session.conversationId);
    if (identification.person) {
      this.deps.store.upsertPerson({ name: identification.person.name, role: context.role, org: context.org, howYouMet: context.howYouMet });
    }
    const person = identification.person && this.deps.store.getPerson(identification.person.id);
    return {
      ...base,
      person: person ?? identification.person,
      howYouMet: context.howYouMet,
      lastSpoke: context.lastSpoke,
      openLoops: context.openLoops,
      dontForget: context.dontForget,
      avoid: context.avoid,
    };
  }

  /** Context about a person changes slowly, so one LLM pass is cached across utterances. */
  async personContext(name: string, currentConversationId?: number): Promise<PersonContext> {
    const cacheKey = name.toLowerCase();
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.at < CONTEXT_TTL_MS) return cached.context;

    const { bee, llm } = this.deps;
    const [facts, hits, todos] = await Promise.allSettled([
      bee.searchFacts(name, 15),
      bee.neuralSearch(`conversation with ${name}`, { limit: 5 }),
      bee.listTodos(50),
    ]);
    const ids = hits.status === "fulfilled" ? findConversationIds(hits.value, 4).filter((id) => id !== currentConversationId) : [];
    const conversations = await Promise.allSettled(ids.slice(0, 2).map((id) => bee.getConversation(id)));

    const prompt = [
      `Now: ${new Date().toISOString()}`,
      `Person: ${name}`,
      `Bee facts:\n${facts.status === "fulfilled" ? compactJson(facts.value, 3000) : "unavailable"}`,
      `Neural search hits:\n${hits.status === "fulfilled" ? compactJson(hits.value, 4000) : "unavailable"}`,
      ...conversations.map((c, i) => `Conversation ${ids[i]}:\n${c.status === "fulfilled" ? compactJson(c.value, 6000) : "unavailable"}`),
      `Bee todos:\n${todos.status === "fulfilled" ? compactJson(todos.value, 3000) : "unavailable"}`,
    ].join("\n\n");

    const raw = await llm.json<Record<string, unknown>>(SYSTEM, prompt, { maxTokens: 700 });
    const lastSpoke = raw["lastSpoke"] as Record<string, unknown> | null | undefined;
    const context: PersonContext = {
      role: strOrUndef(raw["role"]),
      org: strOrUndef(raw["org"]),
      howYouMet: strOrUndef(raw["howYouMet"]),
      lastSpoke:
        lastSpoke && strOrUndef(lastSpoke["when"]) && strOrUndef(lastSpoke["topic"])
          ? { when: strOrUndef(lastSpoke["when"])!, topic: strOrUndef(lastSpoke["topic"])! }
          : undefined,
      openLoops: normalizeOpenLoops(raw["openLoops"]),
      dontForget: strList(raw["dontForget"]),
      avoid: strList(raw["avoid"]),
    };
    this.cache.set(cacheKey, { at: Date.now(), context });
    return context;
  }
}
