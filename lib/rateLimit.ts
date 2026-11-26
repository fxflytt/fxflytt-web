// Per-IP (or per-key) rate limit, shared by all server instances.
// Vercel runs the site on several instances; a limit kept only in memory could be passed by spreading
// requests over them. The counters live in Upstash (fixed time window: INCR + EXPIRE), the same store
// as the spam guard. Without Upstash – or if it does not answer – the limit falls back to memory, so
// the public endpoints are always protected.
import { kv, kvConfigured } from "./booking/kv.ts";

const hits = new Map<string, number[]>();

function memLimited(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  list.push(now);
  hits.set(key, list);
  if (hits.size > 5000) hits.clear();
  return list.length > max;
}

/** Counts one request for `key`; true when there were more than `max` in the time window. */
export async function rateLimited(key: string, max: number, windowMs: number): Promise<boolean> {
  if (!kvConfigured()) return memLimited(key, max, windowMs);
  const slot = Math.floor(Date.now() / windowMs);
  const k = `rl2:${key}:${slot}`;
  try {
    const n = Number(await kv(["INCR", k]));
    if (n === 1) await kv(["EXPIRE", k, Math.ceil(windowMs / 1000) + 5]);
    return n > max;
  } catch {
    return memLimited(key, max, windowMs);   // storage down: still protect with memory
  }
}

export function clientIp(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "unknown";
}
