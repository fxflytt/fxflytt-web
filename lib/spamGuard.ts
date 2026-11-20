// Protection against robots that send many fake requests from the website forms
// (quote form /api/offer, "Bli uppringd" /api/kontakt, "Få priset på mejl" /api/lead).
//
// Layers (the hidden "Lämna tomt" field is checked in each route before this):
//  1. Time trap: a person needs a few seconds to fill in a form; a robot posts at once.
//     The page sends `ft` = milliseconds since the form was opened. Under 3 s → dropped silently.
//     No `ft` at all (a robot calling the API directly) → accepted but marked as suspicious.
//  2. Per device (IP): max 5 requests per 10 minutes for each form.
//  3. Per phone number: one request per hour for each form (stops the same fake number being repeated).
//  4. The whole site: more than 30 requests in one hour → the requests are marked as suspicious and the
//     owner gets one push notice per hour.
// The counters live in Upstash (shared by all server instances); without Upstash they fall back to memory.
import { kv, kvConfigured } from "./booking/kv.ts";

export const LIMITS = { minMs: 3000, perIp: 5, ipWindowS: 600, phoneWindowS: 3600, sitePerHour: 30 };

export type GuardResult =
  | { action: "drop" }                                   // pretend it worked, do nothing (robot)
  | { action: "block"; error: string }                    // tell the visitor (429)
  | { action: "ok"; suspicious: boolean; reason?: string; alert?: boolean };

const mem = new Map<string, { n: number; until: number }>();
function memIncr(key: string, ttlS: number): number {
  const now = Date.now(), e = mem.get(key);
  if (!e || e.until < now) { mem.set(key, { n: 1, until: now + ttlS * 1000 }); if (mem.size > 5000) mem.clear(); return 1; }
  e.n++; return e.n;
}
async function incr(key: string, ttlS: number): Promise<number> {
  if (!kvConfigured()) return memIncr(key, ttlS);
  try {
    const n = Number(await kv(["INCR", key]));
    if (n === 1) await kv(["EXPIRE", key, ttlS]);
    return n;
  } catch { return memIncr(key, ttlS); }   // storage down: still protect with memory
}

export const phoneKey = (p: string) => p.replace(/\D/g, "").replace(/^46/, "0").slice(-9);

export async function guard(kind: "offer" | "kontakt" | "lead", ip: string, ft: unknown, phone?: string): Promise<GuardResult> {
  // 1. time trap
  const t = typeof ft === "number" && isFinite(ft) ? ft : null;
  if (t !== null && t < LIMITS.minMs) return { action: "drop" };
  // 2. per device
  if ((await incr(`rl:${kind}:ip:${ip}`, LIMITS.ipWindowS)) > LIMITS.perIp)
    return { action: "block", error: "För många förfrågningar. Ring oss gärna på 076-300 07 23." };
  // 3. per phone number
  const pk = phone ? phoneKey(phone) : "";
  if (pk.length >= 6 && (await incr(`rl:${kind}:tel:${pk}`, LIMITS.phoneWindowS)) > 1)
    return { action: "block", error: "Vi har redan fått en förfrågan från det här numret och hör av oss snart. Brådskande? Ring 076-300 07 23." };
  // 4. the whole site
  const hour = new Date().toISOString().slice(0, 13);
  const site = await incr(`rl:site:${hour}`, 7200);
  const reasons: string[] = [];
  if (t === null) reasons.push("skickad utan formulärets tidsstämpel");
  if (site > LIMITS.sitePerHour) reasons.push(`ovanligt många förfrågningar (${site} senaste timmen)`);
  return { action: "ok", suspicious: reasons.length > 0, reason: reasons.join(", ") || undefined, alert: site === LIMITS.sitePerHour + 1 };
}

/** Text put first in the message to the office when a request looks like spam. */
export const suspectNote = (reason?: string) => `[Möjlig spam: ${reason || "okänd orsak"} – kontrollera innan ni ringer] `;
