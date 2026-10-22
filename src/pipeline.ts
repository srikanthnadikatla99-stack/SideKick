import type { BeeGateway } from "./bee/client.ts";
import type { CardAssembler } from "./context/assembler.ts";
import { baseCard } from "./context/assembler.ts";
import type { Hub } from "./hub.ts";
import type { Identifier } from "./identify/identifier.ts";
import type { LiveSession, SessionStore } from "./ingest/sessions.ts";
import { transcriptText } from "./ingest/sessions.ts";
import type { LlmProvider } from "./llm/provider.ts";
import { draftFollowUp } from "./loops/promises.ts";
import type { Notifier } from "./notify/ntfy.ts";
import { noopNotifier } from "./notify/ntfy.ts";
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
  notifier?: Notifier;
};

const DEBOUNCE_MS = 1200;

/** Ingestion → identification → card → follow-up, per live conversation. */
export class Pipeline {
  private timers = new Map<string, NodeJS.Timeout>();
  private running = new Map<string, Promise<void>>();
  private dirty = new Set<string>();
  private firstCardLogged = new Set<string>();
  private notified = new Set<string>();
  private notifier: Notifier;
  /** Last time Bee sent anything; drives the "Bee isn't capturing" alert. */
  lastActivity = Date.now();

  constructor(private deps: PipelineDeps) {
    this.notifier = deps.notifier ?? noopNotifier;
  }

  async handle(event: BeeEvent): Promise<void> {
    this.lastActivity = Date.now();
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
    console.log(`[followup] todo created in Bee${todoId === undefined ? "" : ` (id ${todoId})`}: ${text}`);
    hub.publish({ followUp: null });
    return store.getFollowUp(id)!;
  }

  dismissFollowUp(id: string): void {
    this.deps.store.resolveFollowUp(id, "dismissed");
    this.deps.hub.publish({ followUp: null });
  }

  private require(conversationUuid: string): LiveSession {
    const session = this.deps.sessions.get(conversationUuid);
    if (!session) throw new Error("That conversation is no longer available");
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
        // Name-from-speech needs no network, so tap the wrist before the slower LLM/Bee pass.
        const quick = await this.deps.identifier.identify(session, { semantic: false });
        const quickName = quick.person?.name ?? quick.inferredName;
        if (quickName && quickName !== (session.card?.person?.name ?? session.card?.inferredName)) {
          session.card = baseCard(session, quick);
          this.publishCard(session);
        }
        const identification = await this.deps.identifier.identify(session);
        session.identification = identification;
        session.card = await this.deps.assembler.assemble(session, identification);
        this.publishCard(session);
      } while (this.dirty.has(uuid));
    })();
    this.running.set(uuid, run);
    try {
      await run;
    } finally {
      this.running.delete(uuid);
    }
  }

  /** Ended conversations may still be confirmed; never let them replace a newer live card. */
  private publishCard(session: LiveSession): void {
    const current = this.deps.hub.current().card;
    const live = this.deps.sessions.isLive(session.conversationUuid);
    if (!live && current && current.conversationUuid !== session.conversationUuid) return;
    this.deps.hub.publish({ card: session.card });
    this.logFirstCard(session);
    this.notifyCard(session);
  }

  /** One wrist notification per person per conversation, once the full card is ready. */
  private notifyCard(session: LiveSession): void {
    const card = session.card;
    const name = card?.person?.name ?? card?.inferredName;
    if (!card || !name || card.pending || !this.deps.sessions.isLive(session.conversationUuid)) return;
    const key = `${session.conversationUuid}:${name.toLowerCase()}`;
    if (this.notified.has(key)) return;
    this.notified.add(key);
    this.notifier.personRecognized(card).catch((e) => console.warn("[notify] card failed:", (e as Error).message));
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
      this.notifier
        .followUpReady(followUp, personName)
        .catch((e) => console.warn("[notify] follow-up failed:", (e as Error).message));
    } finally {
      this.timers.delete(uuid);
      this.firstCardLogged.delete(uuid);
      for (const key of this.notified) if (key.startsWith(`${uuid}:`)) this.notified.delete(key);
      this.deps.identifier.forget(uuid);
      this.deps.sessions.end(uuid);
    }
  }
}
