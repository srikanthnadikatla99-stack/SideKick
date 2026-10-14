import { createReadStream } from "node:fs";
import { createInterface } from "node:readline";
import { setTimeout as sleep } from "node:timers/promises";
import type { BeeClient } from "@beeai/cli/lib";
import type { BeeEvent } from "../types.ts";

export const STREAM_TYPES = ["new-conversation", "new-utterance", "update-conversation"] as const;
export type StreamType = (typeof STREAM_TYPES)[number];

/** One raw Bee event, as stored in fixtures/*.jsonl. */
export type RawEvent = { t: number; type: StreamType; data: unknown };

type Rec = Record<string, unknown>;
const rec = (v: unknown): Rec => (v && typeof v === "object" ? (v as Rec) : {});
const str = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : undefined);
const num = (v: unknown) => (typeof v === "number" ? v : undefined);

export function normalizeEvent(type: StreamType, data: unknown, now = Date.now()): BeeEvent | null {
  const d = rec(data);
  if (type === "new-utterance") {
    const u = rec(d["utterance"]);
    const conversationUuid = str(d["conversation_uuid"]);
    const text = str(u["text"]);
    if (!conversationUuid || !text) return null;
    return {
      kind: "utterance",
      conversationUuid,
      utterance: {
        speaker: str(u["speaker"]) ?? "unknown",
        text,
        at: num(u["spoken_at"]) ?? num(u["start"]) ?? now,
      },
    };
  }
  const c = rec(d["conversation"]);
  const id = num(c["id"]);
  const uuid = str(c["uuid"]);
  if (type === "new-conversation") {
    if (!uuid) return null;
    return { kind: "conversation-open", conversationUuid: uuid, conversationId: id, title: str(c["title"]) };
  }
  if (c["state"] !== "processed" || id === undefined) return null;
  return {
    kind: "conversation-processed",
    conversationId: id,
    conversationUuid: uuid,
    summary: str(c["short_summary"]) ?? str(c["summary"]),
  };
}

/**
 * `bee stream --json` prints only the event payload and drops the event name, so we open
 * one filtered stream per type to know exactly which event each payload belongs to.
 */
export async function* liveRawEvents(bee: BeeClient, signal?: AbortSignal): AsyncGenerator<RawEvent> {
  const queue: RawEvent[] = [];
  let wake: (() => void) | undefined;
  let failure: unknown;
  let open: number = STREAM_TYPES.length;
  const start = Date.now();

  const streams = STREAM_TYPES.map((type) => {
    const stream = bee.sse.streamJson({ types: [type], signal });
    (async () => {
      try {
        for await (const event of stream.events) {
          queue.push({ t: Date.now() - start, type, data: event.data });
          wake?.();
        }
      } catch (error) {
        if (!signal?.aborted) failure ??= error;
      } finally {
        open--;
        wake?.();
      }
    })();
    return stream;
  });

  try {
    while (true) {
      while (queue.length > 0) yield queue.shift()!;
      if (failure) throw failure;
      if (open === 0) return;
      await new Promise<void>((resolve) => (wake = resolve));
      wake = undefined;
    }
  } finally {
    for (const stream of streams) stream.close();
  }
}

export async function* replayRawEvents(file: string, speed = 1, signal?: AbortSignal): AsyncGenerator<RawEvent> {
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  let last = 0;
  for await (const line of lines) {
    if (signal?.aborted) return;
    if (!line.trim()) continue;
    const event = JSON.parse(line) as RawEvent;
    const wait = Math.max(0, event.t - last) / speed;
    last = event.t;
    if (wait > 0) await sleep(wait, undefined, { signal }).catch(() => undefined);
    yield event;
  }
}

export async function* normalized(raw: AsyncIterable<RawEvent>): AsyncGenerator<BeeEvent> {
  for await (const event of raw) {
    const normalizedEvent = normalizeEvent(event.type, event.data);
    if (normalizedEvent) yield normalizedEvent;
  }
}
