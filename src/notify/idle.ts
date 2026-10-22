import type { Notifier } from "./ntfy.ts";

export type IdleConfig = { hours: string; timeZone: string; afterMinutes: number };

function localHour(now: number, timeZone: string): number {
  return Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone }).format(now));
}

/** True when Bee has been silent for too long during the wearer's active hours. */
export function isIdle(now: number, lastActivity: number, cfg: IdleConfig): boolean {
  const [start, end] = cfg.hours.split("-").map(Number) as [number, number];
  const hour = localHour(now, cfg.timeZone);
  const active = start <= end ? hour >= start && hour < end : hour >= start || hour < end;
  return active && now - lastActivity >= cfg.afterMinutes * 60_000;
}

/** Warns once per silent stretch; a new Bee event re-arms the warning. */
export function startIdleWatcher(opts: {
  notifier: Notifier;
  lastActivity: () => number;
  config: IdleConfig;
  intervalMs?: number;
}): () => void {
  let warnedFor = -1;
  const timer = setInterval(() => {
    const last = opts.lastActivity();
    if (warnedFor === last || !isIdle(Date.now(), last, opts.config)) return;
    warnedFor = last;
    opts.notifier
      .beeIdle(Math.round((Date.now() - last) / 60_000))
      .catch((error) => console.warn("[notify] idle alert failed:", (error as Error).message));
  }, opts.intervalMs ?? 5 * 60_000);
  timer.unref();
  return () => clearInterval(timer);
}
