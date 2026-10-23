import type { Card, FollowUp } from "../types.ts";

export interface Notifier {
  personRecognized(card: Card): Promise<void>;
  followUpReady(followUp: FollowUp, personName: string): Promise<void>;
  beeIdle(minutes: number): Promise<void>;
}

export const noopNotifier: Notifier = {
  personRecognized: async () => {},
  followUpReady: async () => {},
  beeIdle: async () => {},
};

type NtfyAction = {
  action: "http";
  label: string;
  url: string;
  method: "POST";
  headers: Record<string, string>;
  body: string;
  clear: boolean;
};

export type NtfyOptions = {
  /** ntfy server to publish to, e.g. http://127.0.0.1:2586. */
  url: string;
  topic: string;
  /** ntfy access token used to publish. */
  token: string;
  /** Public SideKick URL the action buttons call back into. */
  publicUrl: string;
  /** SideKick API token sent with action-button requests. */
  apiToken: string;
  fetch?: typeof fetch;
};

/** Sends SideKick events to ntfy; the iPhone app mirrors them to the watch with action buttons. */
export class NtfyNotifier implements Notifier {
  private fetch: typeof fetch;

  constructor(private opts: NtfyOptions) {
    this.fetch = opts.fetch ?? fetch;
  }

  async personRecognized(card: Card): Promise<void> {
    const name = card.person?.name ?? card.inferredName;
    if (!name) return;
    const subtitle = [card.role ?? card.person?.role, card.org ?? card.person?.org].filter(Boolean).join(" · ");
    const loop = card.openLoops[0];
    const lines = [
      subtitle,
      loop ? `${loop.direction === "you_owe" ? "⚠️ You owe" : "↩️ They owe"}: ${loop.text}` : "",
      (card.howYouMet ?? card.person?.howYouMet) ? `Met: ${card.howYouMet ?? card.person?.howYouMet}` : "",
      card.lastSpoke ? `Last: ${card.lastSpoke.when} · ${card.lastSpoke.topic}` : "",
      card.dontForget[0] ? `💡 ${card.dontForget[0]}` : "",
    ].filter(Boolean);
    const actions = card.confirmed
      ? []
      : [
          this.action("Yes, it's them", "/api/confirm", {
            conversationUuid: card.conversationUuid,
            ...(card.person ? { personId: card.person.id } : { name }),
          }),
          this.action("Not them", "/api/reject", { conversationUuid: card.conversationUuid, name }),
        ];
    await this.publish({
      title: name,
      message: [...lines, "Open SideKick on your watch for details."].join("\n"),
      tags: ["bust_in_silhouette"],
      priority: 4,
      sequence_id: `card-${card.conversationUuid}`,
      actions,
    });
  }

  async followUpReady(followUp: FollowUp, personName: string): Promise<void> {
    await this.publish({
      title: `Follow up with ${personName}`,
      message: `${followUp.text}\nOpen SideKick to add it to Bee.`,
      tags: ["memo"],
      priority: 4,
      sequence_id: `followup-${followUp.id}`,
      actions: [
        this.action("Add to Bee", `/api/followups/${followUp.id}/approve`, {}),
        this.action("Not now", `/api/followups/${followUp.id}/dismiss`, {}),
      ],
    });
  }

  async beeIdle(minutes: number): Promise<void> {
    const hours = Math.round(minutes / 60);
    await this.publish({
      title: "Bee isn't capturing",
      message: `No conversations for ${hours >= 1 ? `${hours}h` : `${minutes}m`}. Start Bee on your watch to get SideKick cards.`,
      tags: ["honeybee"],
      priority: 3,
      sequence_id: "bee-idle",
      actions: [],
    });
  }

  private action(label: string, path: string, body: Record<string, unknown>): NtfyAction {
    return {
      action: "http",
      label,
      url: new URL(path, this.opts.publicUrl).toString(),
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.apiToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      clear: true,
    };
  }

  private async publish(message: Record<string, unknown>): Promise<void> {
    const response = await this.fetch(this.opts.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.opts.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ topic: this.opts.topic, ...message }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`ntfy publish failed: ${response.status} ${await response.text()}`);
  }
}
