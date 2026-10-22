import { loadConfig } from "./config.ts";
import { createBeeGateway } from "./bee/client.ts";
import { CardAssembler } from "./context/assembler.ts";
import { Hub } from "./hub.ts";
import { Identifier } from "./identify/identifier.ts";
import { liveRawEvents, normalized, replayRawEvents } from "./ingest/beeStream.ts";
import { SessionStore } from "./ingest/sessions.ts";
import { createBedrockProvider } from "./llm/provider.ts";
import { startIdleWatcher } from "./notify/idle.ts";
import { NtfyNotifier } from "./notify/ntfy.ts";
import { Pipeline } from "./pipeline.ts";
import { createApiServer } from "./server.ts";
import { Store } from "./store/db.ts";

function ownerNamesFrom(profile: unknown): string[] {
  const p = (profile && typeof profile === "object" ? profile : {}) as Record<string, unknown>;
  const user = (p["user"] && typeof p["user"] === "object" ? p["user"] : p) as Record<string, unknown>;
  return ["first_name", "last_name", "name", "firstName", "lastName"]
    .map((k) => user[k])
    .filter((v): v is string => typeof v === "string" && v.trim().length > 0)
    .flatMap((v) => [v.trim(), ...v.trim().split(/\s+/)]);
}

async function main() {
  const config = loadConfig();
  const bee = createBeeGateway(config.beeCommand);

  if (!(await bee.raw.auth.isAuthenticated())) {
    throw new Error("Bee CLI is not authenticated. Run `npx bee login` first.");
  }
  const ownerNames = ownerNamesFrom(await bee.me());
  console.log(`[bee] authenticated as ${ownerNames[0] ?? "unknown"}`);

  const store = new Store(config.dbPath);
  const llm = createBedrockProvider(config.awsRegion, config.bedrockModelId);
  const hub = new Hub((card) => store.saveLatestCard(card));
  const notifier = config.ntfy ? new NtfyNotifier({ ...config.ntfy, apiToken: config.token }) : undefined;
  console.log(`[notify] ${notifier ? `ntfy topic configured` : "disabled (NTFY_URL not set)"}`);
  const pipeline = new Pipeline({
    sessions: new SessionStore(),
    identifier: new Identifier({ store, bee, llm, ownerNames }),
    assembler: new CardAssembler({ bee, llm, store }),
    store,
    bee,
    llm,
    hub,
    notifier,
  });
  if (notifier && config.source === "live") {
    startIdleWatcher({ notifier, lastActivity: () => pipeline.lastActivity, config: config.idleAlert });
  }

  const pending = store.latestPendingFollowUp();
  if (pending) hub.publish({ followUp: pending });
  // The watch may open long after the wrist notification, even across a restart.
  const lastCard = store.loadLatestCard();
  if (lastCard && Date.now() - Date.parse(lastCard.updatedAt) < 6 * 3_600_000) hub.publish({ card: lastCard });

  const server = createApiServer({ hub, pipeline, token: config.token });
  server.listen(config.port, config.host, () => console.log(`[server] http://${config.host}:${config.port}`));

  const abort = new AbortController();
  const shutdown = () => {
    abort.abort();
    server.close();
    // The watch's long-poll keeps connections open, so close() alone never finishes.
    server.closeAllConnections();
    setTimeout(() => process.exit(0), 2000).unref();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  const raw =
    config.source === "replay"
      ? replayRawEvents(config.replayFile, config.replaySpeed, abort.signal)
      : liveRawEvents(bee.raw, abort.signal);
  console.log(`[ingest] source=${config.source}${config.source === "replay" ? ` file=${config.replayFile}` : ""}`);

  for await (const event of normalized(raw)) {
    pipeline.handle(event).catch((error) => console.error("[pipeline]", error));
  }
  if (!abort.signal.aborted) console.log("[ingest] stream ended");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
