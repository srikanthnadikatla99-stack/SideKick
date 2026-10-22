import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

if (existsSync(".env")) process.loadEnvFile(".env");

function env(name: string, fallback?: string): string {
  const value = process.env[name];
  if (value !== undefined && value !== "") return value;
  if (fallback !== undefined) return fallback;
  throw new Error(`Missing required environment variable ${name} (see .env.example)`);
}

const localBee = fileURLToPath(new URL("../node_modules/.bin/bee", import.meta.url));

export function resolveBeeCommand(): string {
  return env("BEE_COMMAND", existsSync(localBee) ? localBee : "bee");
}

export type Config = ReturnType<typeof loadConfig>;

export function loadConfig() {
  const source = env("SIDEKICK_SOURCE", "live");
  if (source !== "live" && source !== "replay") {
    throw new Error(`SIDEKICK_SOURCE must be "live" or "replay", got "${source}"`);
  }
  const token = env("SIDEKICK_TOKEN");
  if (token.length < 32) {
    throw new Error("SIDEKICK_TOKEN must be at least 32 characters (openssl rand -hex 32)");
  }
  return {
    source: source as "live" | "replay",
    replayFile: env("SIDEKICK_REPLAY_FILE", "fixtures/demo.jsonl"),
    replaySpeed: Number(env("SIDEKICK_REPLAY_SPEED", "1")),
    host: env("SIDEKICK_HOST", "127.0.0.1"),
    port: Number(env("SIDEKICK_PORT", "8787")),
    token,
    dbPath: env("SIDEKICK_DB", "data/sidekick.db"),
    beeCommand: resolveBeeCommand(),
    awsRegion: env("AWS_REGION", "us-east-1"),
    bedrockModelId: env("BEDROCK_MODEL_ID", "us.amazon.nova-pro-v1:0"),
    // Wrist notifications via a self-hosted ntfy server; disabled unless NTFY_URL is set.
    ntfy: process.env["NTFY_URL"]
      ? {
          url: env("NTFY_URL"),
          topic: env("NTFY_TOPIC"),
          token: env("NTFY_TOKEN"),
          publicUrl: env("SIDEKICK_PUBLIC_URL"),
        }
      : undefined,
    idleAlert: {
      hours: env("SIDEKICK_ACTIVE_HOURS", "9-19"),
      timeZone: env("SIDEKICK_TIMEZONE", "UTC"),
      afterMinutes: Number(env("SIDEKICK_IDLE_MINUTES", "120")),
    },
  };
}
