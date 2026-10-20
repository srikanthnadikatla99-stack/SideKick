import type { BeeEvent, Card, Identification, Utterance } from "../types.ts";

export type LiveSession = {
  conversationUuid: string;
  conversationId?: number;
  title?: string;
  utterances: Utterance[];
  identification?: Identification;
  card?: Card;
  startedAt: number;
};

const RECENT_LIMIT = 20;

/** Per-conversation state for conversations currently being captured. */
export class SessionStore {
  private byUuid = new Map<string, LiveSession>();
  private uuidById = new Map<number, string>();
  // Ended conversations stay confirmable for a while; people often tap after the chat.
  private recent = new Map<string, LiveSession>();

  get(uuid: string): LiveSession | undefined {
    return this.byUuid.get(uuid) ?? this.recent.get(uuid);
  }

  isLive(uuid: string): boolean {
    return this.byUuid.has(uuid);
  }

  /** Returns the session the event belongs to, creating it lazily since streams are not ordered. */
  apply(event: BeeEvent): LiveSession | undefined {
    switch (event.kind) {
      case "conversation-open": {
        const session = this.ensure(event.conversationUuid);
        if (event.conversationId !== undefined) {
          session.conversationId = event.conversationId;
          this.uuidById.set(event.conversationId, event.conversationUuid);
        }
        session.title = event.title ?? session.title;
        return session;
      }
      case "utterance": {
        const session = this.ensure(event.conversationUuid);
        session.utterances.push(event.utterance);
        return session;
      }
      case "conversation-processed": {
        const uuid = event.conversationUuid ?? this.uuidById.get(event.conversationId);
        if (!uuid) return undefined;
        const session = this.ensure(uuid);
        session.conversationId = event.conversationId;
        return session;
      }
    }
  }

  end(uuid: string): void {
    const session = this.byUuid.get(uuid);
    if (!session) return;
    if (session.conversationId !== undefined) this.uuidById.delete(session.conversationId);
    this.byUuid.delete(uuid);
    this.recent.set(uuid, session);
    if (this.recent.size > RECENT_LIMIT) this.recent.delete(this.recent.keys().next().value!);
  }

  private ensure(uuid: string): LiveSession {
    let session = this.byUuid.get(uuid);
    if (!session) {
      session = { conversationUuid: uuid, utterances: [], startedAt: Date.now() };
      this.byUuid.set(uuid, session);
    }
    return session;
  }
}

export function transcriptText(utterances: Utterance[], last = 40): string {
  return utterances
    .slice(-last)
    .map((u) => `${u.speaker}: ${u.text}`)
    .join("\n");
}
