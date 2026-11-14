// Push notifications to the admin app on phones and computers (Web Push).
// The VAPID key pair is made automatically the first time and kept in Upstash (fx:vapid), so nothing has to
// be set up in Vercel. Devices are kept in fx:push. A device that the browser has dropped is removed.
import webpush from "web-push";
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type Sub = { id: string; userId: string; userName: string; endpoint: string; keys: { p256dh: string; auth: string }; device: string; createdAt: number };
const KEY = "fx:push", VKEY = "fx:vapid";

export async function vapid(): Promise<{ publicKey: string; privateKey: string }> {
  const s = await kv<string | null>(["GET", VKEY]);
  if (s) return JSON.parse(s);
  const k = webpush.generateVAPIDKeys();
  // NX: if two requests race, the first key wins and both use it.
  await kv(["SET", VKEY, JSON.stringify(k), "NX"]);
  return JSON.parse((await kv<string>(["GET", VKEY]))!);
}

export async function listSubs(): Promise<Sub[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? JSON.parse(s) : [];
}
const saveSubs = (l: Sub[]) => kv(["SET", KEY, JSON.stringify(l)]);

export async function addSub(user: { id: string; name: string }, d: Record<string, unknown>, device: string): Promise<Sub> {
  const endpoint = typeof d.endpoint === "string" ? d.endpoint : "";
  const keys = (d.keys || {}) as { p256dh?: unknown; auth?: unknown };
  if (!/^https:\/\//.test(endpoint) || endpoint.length > 1000 || typeof keys.p256dh !== "string" || typeof keys.auth !== "string") throw new Error("Ogiltig prenumeration.");
  const list = (await listSubs()).filter((s) => s.endpoint !== endpoint);
  const sub: Sub = { id: randomBytes(6).toString("hex"), userId: user.id, userName: user.name, endpoint, keys: { p256dh: keys.p256dh.slice(0, 200), auth: keys.auth.slice(0, 100) }, device: device.slice(0, 120), createdAt: Date.now() };
  list.push(sub);
  await saveSubs(list.slice(-50));
  return sub;
}

export async function removeSub(match: (s: Sub) => boolean) {
  const list = await listSubs(), keep = list.filter((s) => !match(s));
  if (keep.length !== list.length) await saveSubs(keep);
  return list.length - keep.length;
}

export type Note = { title: string; body: string; url: string; tag?: string };

// Sends to every device (or only `only`). Never throws – a failed notification must not break a booking.
export async function notifyAll(n: Note, only?: (s: Sub) => boolean): Promise<number> {
  try {
    const subs = (await listSubs()).filter(only || (() => true));
    if (!subs.length) return 0;
    const v = await vapid();
    webpush.setVapidDetails("mailto:" + (process.env.OFFER_TO || "info@fxflytt.se"), v.publicKey, v.privateKey);
    const gone: string[] = [];
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(n), { TTL: 6 * 3600, timeout: 5000 }); ok++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) gone.push(s.endpoint); }
    }));
    if (gone.length) await removeSub((s) => gone.includes(s.endpoint));
    return ok;
  } catch { return 0; }
}
