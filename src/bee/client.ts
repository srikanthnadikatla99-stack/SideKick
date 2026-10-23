import { createBeeClient, type BeeClient } from "@beeai/cli/lib";


export interface BeeGateway {
  me(): Promise<unknown>;
  searchFacts(query: string, limit?: number): Promise<unknown>;
  neuralSearch(query: string, opts?: { limit?: number; since?: number }): Promise<unknown>;
  getConversation(id: number): Promise<unknown>;
  listTodos(limit?: number): Promise<unknown>;
  createTodo(text: string, alarmAt?: string): Promise<unknown>;
}

export function createBeeGateway(command: string): BeeGateway & { raw: BeeClient } {
  const bee = createBeeClient({ command });
  return {
    raw: bee,
    me: () => bee.api.me(),
    // The library has no facts-search helper, so call the CLI subcommand directly.
    searchFacts: (query, limit = 10) =>
      bee.runJson(["facts", "search", "--query", query, "--limit", String(limit)]),
    neuralSearch: (query, opts = {}) =>
      bee.api.search({ query, neural: true, limit: opts.limit ?? 5, since: opts.since }),
    getConversation: (id) => bee.api.conversations.get(id),
    listTodos: (limit = 50) => bee.api.todos.list({ limit }),
    createTodo: (text, alarmAt) => bee.api.todos.create({ text, alarmAt }),
  };
}

/** Bee responses are passed verbatim; trim them to a size an LLM prompt can afford. */
export function compactJson(value: unknown, maxChars = 6000): string {
  const text = JSON.stringify(value, (_key, v) => (v === null ? undefined : v));
  if (!text) return "";
  return text.length > maxChars ? `${text.slice(0, maxChars)}…[truncated]` : text;
}

/** Collect numeric conversation ids from an arbitrary Bee search response. */
export function findConversationIds(value: unknown, limit = 5): number[] {
  const ids: number[] = [];
  const visit = (node: unknown, parentKey: string) => {
    if (ids.length >= limit || node === null || typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, parentKey);
      return;
    }
    const record = node as Record<string, unknown>;
    const id = record["conversation_id"] ?? (/conversation|result|hit/i.test(parentKey) ? record["id"] : undefined);
    if (typeof id === "number" && !ids.includes(id)) ids.push(id);
    for (const [key, child] of Object.entries(record)) visit(child, key);
  };
  visit(value, "");
  return ids;
}
