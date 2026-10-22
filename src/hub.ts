import type { Card, FollowUp } from "./types.ts";

export type Snapshot = { version: number; card: Card | null; followUp: FollowUp | null };

/** Latest state for the watch, with long-poll support. */
export class Hub {
  private snapshot: Snapshot = { version: 0, card: null, followUp: null };
  private waiters = new Set<() => void>();

  constructor(private onCardChange?: (card: Card | null) => void) {}

  current(): Snapshot {
    return this.snapshot;
  }

  publish(change: Partial<Omit<Snapshot, "version">>): void {
    this.snapshot = { ...this.snapshot, ...change, version: this.snapshot.version + 1 };
    if ("card" in change) this.onCardChange?.(this.snapshot.card);
    for (const wake of this.waiters) wake();
    this.waiters.clear();
  }

  /** Resolves as soon as the version moves past `since`, or with the unchanged snapshot on timeout. */
  waitForChange(since: number, timeoutMs: number, signal?: AbortSignal): Promise<Snapshot> {
    if (this.snapshot.version !== since) return Promise.resolve(this.snapshot);
    return new Promise((resolve) => {
      const done = () => {
        clearTimeout(timer);
        this.waiters.delete(done);
        signal?.removeEventListener("abort", done);
        resolve(this.snapshot);
      };
      const timer = setTimeout(done, timeoutMs);
      this.waiters.add(done);
      signal?.addEventListener("abort", done, { once: true });
    });
  }
}
