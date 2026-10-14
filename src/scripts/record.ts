import { createWriteStream, mkdirSync } from "node:fs";
import { createBeeClient } from "@beeai/cli/lib";
import { resolveBeeCommand } from "../config.ts";
import { liveRawEvents } from "../ingest/beeStream.ts";

// Records real Bee stream events to fixtures/ for tests and deterministic demo replay.
const file = process.argv[2] ?? `fixtures/recording-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`;
mkdirSync("fixtures", { recursive: true });
const out = createWriteStream(file, { flags: "a" });

const abort = new AbortController();
process.once("SIGINT", () => abort.abort());
console.log(`Recording Bee events to ${file} (Ctrl+C to stop)`);

let count = 0;
for await (const event of liveRawEvents(createBeeClient({ command: resolveBeeCommand() }), abort.signal)) {
  out.write(`${JSON.stringify(event)}\n`);
  console.log(`${++count} ${event.type}`);
}
out.end();
