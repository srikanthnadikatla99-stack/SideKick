import type { BeeGateway } from "./bee/client.ts";
import type { CardAssembler } from "./context/assembler.ts";
import type { Hub } from "./hub.ts";
import type { Identifier } from "./identify/identifier.ts";
import type { LiveSession, SessionStore } from "./ingest/sessions.ts";
import { transcriptText } from "./ingest/sessions.ts";
import type { LlmProvider } from "./llm/provider.ts";
import { draftFollowUp } from "./loops/promises.ts";
import type { Store } from "./store/db.ts";
import type { BeeEvent, FollowUp } from "./types.ts";

export type PipelineDeps = {
  sessions: SessionStore;
  identifier: Identifier;
  assembler: CardAssembler;
  store: Store;
  bee: BeeGateway;
  llm: LlmProvider;
  hub: Hub;
};

const DEBOUNCE_MS = 1200;

/** Ingestion → identification → card → follow-up, per live conversation. */
export class Pipeline {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Map<string, Promise<void>>();
  private dirty = new Set<string>();
  private firstCardLogged = new Set<string>();

  constructor(private deps: PipelineDeps) {}

  async handle(event: BeeEvent): Promise<void> {
    const session = this.deps.sessions.apply(event);
    if (!session) return;
    if (event.kind === "utterance") this.schedule(session);
    if (event.kind === "conversation-processed") await this.closeLoop(session, event.summary);
  }

  async confirm(conversationUuid: string, input: { personId?: string; name?: string }): Promise<void> {
    const session = this.require(conversationUuid);
    this.deps.identifier.confirm(session, input);
    await this.refresh(session);
  }

  async reject(conversationUuid: string, name: string): Promise<void> {
    const session = this.require(conversationUuid);
    this.deps.identifier.reject(session, name);
    await this.refresh(session);
  }

  async approveFollowUp(id: string, editedText?: string): Promise<FollowUp> {
    const { store, bee, hub } = this.deps;
    const followUp = store.getFollowUp(id);
    if (!followUp || followUp.status !== "pending") throw new Error("Follow-up not found or already resolved");
    const text = editedText?.trim() || followUp.text;
    const created = (await bee.createTodo(text)) as Record<string, unknown> | null;
    const todoId = created?.["id"] ?? (created?.["todo"] as Record<string, unknown> | undefined)?.["id"];
    store.resolveFollowUp(id, "approved", text, todoId === undefined ? undefined : String(todoId));
    hub.publish({ followUp: null });
    return store.getFollowUp(id)!;
  }

  dismissFollowUp(id: string): void {
    this.deps.store.resolveFollowUp(id, "dismissed");
    this.deps.hub.publish({ followUp: null });
  }

  private require(conversationUuid: string): LiveSession {
    const session = this.deps.sessions.get(conversationUuid);
    if (!session) throw new Error("No live conversation with that id");
    return session;
  }

  private schedule(session: LiveSession): void {
    clearTimeout(this.timers.get(session.conversationUuid));
    // The first utterance refreshes immediately so a self-introduction lands fast.
    const delay = session.utterances.length <= 1 ? 0 : DEBOUNCE_MS;
    this.timers.set(
      session.conversationUuid,
      setTimeout(() => void this.refresh(session).catch((e) => console.error("[pipeline] refresh failed:", e)), delay),
    );
  }

  private async refresh(session: LiveSession): Promise<void> {
    const uuid = session.conversationUuid;
    const inFlight = this.running.get(uuid);
    if (inFlight) {
      this.dirty.add(uuid);
      return inFlight;
    }
    const run = (async () => {
      do {
        this.dirty.delete(uuid);
        const identification = await this.deps.identifier.identify(session);
        session.identification = identification;
        session.card = await this.deps.assembler.assemble(session, identification);
        this.deps.hub.publish({ card: session.card });
        this.logFirstCard(session);
      } while (this.dirty.has(uuid));
    })();
    this.running.set(uuid, run);
    try {
      await run;
    } finally {
      this.running.delete(uuid);
    }
  }

  private logFirstCard(session: LiveSession): void {
    const name = session.card?.person?.name ?? session.card?.inferredName;
    if (!name || this.firstCardLogged.has(session.conversationUuid)) return;
    this.firstCardLogged.add(session.conversationUuid);
    const first = session.utterances[0]?.at ?? session.startedAt;
    console.log(`[pipeline] card for ${name} after ${Date.now() - first}ms (confidence ${session.card!.confidence})`);
  }

  private async closeLoop(session: LiveSession, summary?: string): Promise<void> {
    const uuid = session.conversationUuid;
    clearTimeout(this.timers.get(uuid));
    await this.running.get(uuid);
    const card = session.card;
    const personName = card?.person?.name ?? card?.inferredName;
    try {
      if (!personName || session.utterances.length === 0) return;
      const text = await draftFollowUp(this.deps.llm, {
        personName,
        summary,
        transcript: transcriptText(session.utterances, 60),
        openLoops: card?.openLoops ?? [],
      });
      if (!text) return;
      const followUp = this.deps.store.addFollowUp({ conversationUuid: uuid, personId: card?.person?.id ?? null, text });
      this.deps.hub.publish({ followUp });
    } finally {
      this.timers.delete(uuid);
      this.firstCardLogged.delete(uuid);
      this.deps.identifier.forget(uuid);
      this.deps.sessions.end(uuid);
    }
  }
}
