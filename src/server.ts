import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";
import type { Hub } from "./hub.ts";
import type { Pipeline } from "./pipeline.ts";
import { DEBUG_PAGE } from "./debugPage.ts";

const MAX_BODY_BYTES = 16 * 1024;
const MAX_WAIT_SECONDS = 25;

class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

function authorized(req: IncomingMessage, token: string): boolean {
  const header = req.headers.authorization ?? "";
  const presented = Buffer.from(header.startsWith("Bearer ") ? header.slice(7) : "");
  const expected = Buffer.from(token);
  return presented.length === expected.length && timingSafeEqual(presented, expected);
}

async function readJson(req: IncomingMessage): Promise<Record<string, unknown>> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY_BYTES) throw new HttpError(413, "Body too large");
    chunks.push(chunk as Buffer);
  }
  if (chunks.length === 0) return {};
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error();
    return value as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "Body must be a JSON object");
  }
}

function field(body: Record<string, unknown>, name: string, opts: { required?: boolean; max?: number } = {}): string | undefined {
  const value = body[name];
  if (value === undefined || value === null || value === "") {
    if (opts.required) throw new HttpError(400, `${name} is required`);
    return undefined;
  }
  if (typeof value !== "string" || value.length > (opts.max ?? 200)) throw new HttpError(400, `${name} is invalid`);
  return value;
}

function send(res: ServerResponse, status: number, body: unknown, contentType = "application/json"): void {
  const payload = contentType === "application/json" ? JSON.stringify(body) : String(body);
  res.writeHead(status, {
    "Content-Type": `${contentType}; charset=utf-8`,
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(contentType === "text/html" ? { "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'" } : {}),
  });
  res.end(payload);
}

export function createApiServer(deps: { hub: Hub; pipeline: Pipeline; token: string }) {
  const { hub, pipeline, token } = deps;

  return createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    try {
      if (req.method === "GET" && url.pathname === "/healthz") return send(res, 200, { ok: true });
      if (req.method === "GET" && url.pathname === "/") return send(res, 200, DEBUG_PAGE, "text/html");
      if (!url.pathname.startsWith("/api/")) throw new HttpError(404, "Not found");
      if (!authorized(req, token)) throw new HttpError(401, "Unauthorized");

      if (req.method === "GET" && url.pathname === "/api/state") {
        const since = Number(url.searchParams.get("since") ?? -1);
        const wait = Math.min(MAX_WAIT_SECONDS, Math.max(0, Number(url.searchParams.get("wait") ?? 0)));
        const abort = new AbortController();
        res.on("close", () => abort.abort());
        const snapshot = wait > 0 && Number.isFinite(since) ? await hub.waitForChange(since, wait * 1000, abort.signal) : hub.current();
        return send(res, 200, snapshot);
      }

      if (req.method !== "POST") throw new HttpError(405, "Method not allowed");
      const body = await readJson(req);

      if (url.pathname === "/api/confirm") {
        const conversationUuid = field(body, "conversationUuid", { required: true })!;
        const personId = field(body, "personId");
        const name = field(body, "name", { max: 80 });
        if (!personId && !name) throw new HttpError(400, "personId or name is required");
        await pipeline.confirm(conversationUuid, { personId, name });
        return send(res, 200, hub.current());
      }
      if (url.pathname === "/api/reject") {
        await pipeline.reject(field(body, "conversationUuid", { required: true })!, field(body, "name", { required: true, max: 80 })!);
        return send(res, 200, hub.current());
      }
      const followUp = url.pathname.match(/^\/api\/followups\/([0-9a-f-]{36})\/(approve|dismiss)$/);
      if (followUp) {
        const [, id, action] = followUp;
        if (action === "approve") return send(res, 200, await pipeline.approveFollowUp(id!, field(body, "text", { max: 300 })));
        pipeline.dismissFollowUp(id!);
        return send(res, 200, hub.current());
      }
      throw new HttpError(404, "Not found");
    } catch (error) {
      if (error instanceof HttpError) return send(res, error.status, { error: error.message });
      console.error("[server]", error);
      const message = error instanceof Error && /not found|already resolved|No live conversation|Unknown person/.test(error.message) ? error.message : "Internal error";
      return send(res, message === "Internal error" ? 500 : 409, { error: message });
    }
  });
}
