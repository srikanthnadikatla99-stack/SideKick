export type Person = {
  id: string;
  name: string;
  role?: string;
  org?: string;
  howYouMet?: string;
};

export type OpenLoop = {
  direction: "you_owe" | "they_owe";
  text: string;
  sourceConversationId?: number;
};

export type Identification = {
  person: Person | null;
  /** Best guess when no stored person matches yet. */
  inferredName?: string;
  confidence: number;
  confirmed: boolean;
  evidence: string[];
};

export type Card = {
  conversationUuid: string;
  person: Person | null;
  inferredName?: string;
  confidence: number;
  confirmed: boolean;
  role?: string;
  org?: string;
  /** Why SideKick thinks it's this person, shown next to the confirm buttons. */
  evidence: string[];
  /** True while history/open loops are still being fetched. */
  pending: boolean;
  howYouMet?: string;
  lastSpoke?: { when: string; topic: string };
  openLoops: OpenLoop[];
  dontForget: string[];
  avoid: string[];
  updatedAt: string;
};

export type FollowUp = {
  id: string;
  conversationUuid: string;
  personId: string | null;
  text: string;
  status: "pending" | "approved" | "dismissed";
  beeTodoId?: string;
};

export type Utterance = {
  speaker: string;
  text: string;
  at: number;
  /** Seconds from the start of the conversation, when Bee provides it. */
  offset?: number;
};

/** Normalized Bee stream event. */
export type BeeEvent =
  | { kind: "conversation-open"; conversationUuid: string; conversationId?: number; title?: string }
  | { kind: "utterance"; conversationUuid: string; utterance: Utterance }
  | {
      kind: "conversation-processed";
      conversationId: number;
      conversationUuid?: string;
      summary?: string;
    };
