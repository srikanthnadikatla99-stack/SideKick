import type { BeeGateway } from "../src/bee/client.ts";
import type { LlmProvider } from "../src/llm/provider.ts";

export function fakeBee(overrides: Partial<BeeGateway> = {}) {
  const todos: string[] = [];
  const bee: BeeGateway = {
    me: async () => ({ first_name: "Alex", last_name: "Rivera" }),
    searchFacts: async () => ({ facts: [{ text: "Sarah Chen is Head of Design at Northwind" }] }),
    neuralSearch: async () => ({ conversations: [{ id: 42, summary: "Lisbon conference chat with Sarah" }] }),
    getConversation: async (id) => ({ conversation: { id, summary: "Promised Sarah the onboarding doc" } }),
    listTodos: async () => ({ todos: [] }),
    createTodo: async (text) => {
      todos.push(text);
      return { id: 900 + todos.length, text };
    },
    ...overrides,
  };
  return { bee, todos };
}

export function fakeLlm(opts: { semanticName?: string | null } = {}) {
  const calls: string[] = [];
  const llm: LlmProvider = {
    async json<T>(system: string): Promise<T> {
      if (system.includes("briefing card")) {
        calls.push("card");
        return {
          role: "Head of Design",
          org: "Northwind",
          howYouMet: "Lisbon conference",
          lastSpoke: { when: "3 weeks ago", topic: "design hiring" },
          openLoops: [
            { direction: "you_owe", text: "Send Sarah the onboarding doc", sourceConversationId: 42 },
            { direction: "sideways", text: "invalid" },
          ],
          dontForget: ["Ask about the partnership"],
          avoid: [],
        } as T;
      }
      calls.push("identify");
      return { name: opts.semanticName ?? null, confidence: 0.8, evidence: "semantic match" } as T;
    },
    async text() {
      calls.push("followup");
      return '"Send Sarah Chen the onboarding doc"';
    },
  };
  return { llm, calls };
}
