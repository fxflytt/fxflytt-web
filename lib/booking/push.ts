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

// cat: which kind of notice it is – each office user can turn kinds off (Inställningar → Notiser).
export type NoteCat = "new" | "view" | "signed" | "declined" | "sla" | "crew" | "reward" | "morning" | "mail" | "complaint" | "question";
export const NOTE_CATS: Record<NoteCat, string> = {
  new: "Ny förfrågan och nya leads", sla: "Förfrågan som ingen har svarat på", view: "Kunden öppnade offerten", signed: "Kunden signerade",
  declined: "Kunden tackade nej", crew: "Personalen: sjuk, ledighet, tog ett jobb, skada", reward: "Tipsa en vän: belöning att ge", morning: "Morgonnotis: samtal, fordon",
  mail: "Viktiga mejl i inkorgen (AI)", complaint: "Nytt klagomål", question: "Kunden frågar något i offerten",
};
export type Note = { title: string; body: string; url: string; tag?: string; cat?: NoteCat };
export type NotePrefs = { off: NoteCat[]; sound: boolean };
export async function getPrefs(uid: string): Promise<NotePrefs> {
  const s = await kv<string | null>(["GET", "fx:nprefs:" + uid]);
  const p = s ? (JSON.parse(s) as Partial<NotePrefs>) : {};
  return { off: (p.off || []).filter((c) => c in NOTE_CATS), sound: p.sound === true };
}
export async function setPrefs(uid: string, d: { off?: unknown; sound?: unknown }): Promise<NotePrefs> {
  const cur = await getPrefs(uid);
  if (Array.isArray(d.off)) cur.off = [...new Set(d.off.filter((c): c is NoteCat => typeof c === "string" && c in NOTE_CATS))];
  if ("sound" in d) cur.sound = d.sound === true;
  await kv(["SET", "fx:nprefs:" + uid, JSON.stringify(cur)]);
  return cur;
}

// Sends to every device (or only `only`). Never throws – a failed notification must not break a booking.
// Everything sent to the office is also kept in a feed (fx:notes, newest first, 150 kept), so the bell in
// the admin page shows it even if the phone was off. Read state is per user (fx:nread:<uid>), shared by
// all the user's devices.
export type FeedItem = Note & { id: string; at: number };
export type ReadState = { all: number; ids: string[] };
const FEED = "fx:notes", FEED_MAX = 150;
export async function recordNote(n: Note): Promise<void> {
  const it: FeedItem = { id: randomBytes(6).toString("hex"), at: Date.now(), title: n.title, body: n.body, url: n.url, ...(n.cat ? { cat: n.cat } : {}) };
  await kv(["LPUSH", FEED, JSON.stringify(it)]); await kv(["LTRIM", FEED, 0, FEED_MAX - 1]);
}
export async function listNotes(): Promise<FeedItem[]> {
  return ((await kv<string[]>(["LRANGE", FEED, 0, FEED_MAX - 1])) || []).map((s) => JSON.parse(s) as FeedItem);
}
export async function readState(uid: string): Promise<ReadState> {
  const s = await kv<string | null>(["GET", "fx:nread:" + uid]);
  return s ? (JSON.parse(s) as ReadState) : { all: 0, ids: [] };
}
export async function markRead(uid: string, id: string | null): Promise<ReadState> {
  const r = await readState(uid);
  if (id === null) { r.all = Date.now(); r.ids = []; }
  else if (/^[0-9a-f]{12}$/.test(id) && !r.ids.includes(id)) r.ids.push(id);
  const keep = new Set((await listNotes()).map((n) => n.id));
  r.ids = r.ids.filter((x) => keep.has(x));
  await kv(["SET", "fx:nread:" + uid, JSON.stringify(r)]);
  return r;
}

export async function notifyAll(n: Note, only?: (s: Sub) => boolean): Promise<number> {
  if (!only) await recordNote(n).catch(() => {});
  try {
    // Default: only admin devices. Crew phones (userId "crew:…") get only what is meant for them.
    let subs = (await listSubs()).filter(only || ((s) => !s.userId.startsWith("crew:")));
    // Office users who turned this kind of notice off don't get it on their devices.
    if (n.cat && !only) {
      const users = [...new Set(subs.map((s) => s.userId))], offFor = new Set<string>();
      await Promise.all(users.map(async (u) => { if ((await getPrefs(u)).off.includes(n.cat!)) offFor.add(u); }));
      subs = subs.filter((s) => !offFor.has(s.userId));
    }
    if (!subs.length) return 0;
    const v = await vapid();
    webpush.setVapidDetails("mailto:" + (process.env.OFFER_TO || "info@fxflytt.se"), v.publicKey, v.privateKey);
    const gone: string[] = [];
    let ok = 0;
    await Promise.all(subs.map(async (s) => {
      // urgency "high": the phone wakes up for it at once (Android may hold "normal" ones while the screen is off).
      try { await webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, JSON.stringify(n), { TTL: 6 * 3600, timeout: 5000, urgency: "high" }); ok++; }
      catch (e) { const c = (e as { statusCode?: number }).statusCode; if (c === 404 || c === 410) gone.push(s.endpoint); }
    }));
    if (gone.length) await removeSub((s) => gone.includes(s.endpoint));
    return ok;
  } catch { return 0; }
}

// Notification to some crew members' phones (crew app), by person id.
export const notifyCrew = (ids: string[], n: Note) =>
  ids.length ? notifyAll(n, (s) => ids.some((id) => s.userId === "crew:" + id)) : Promise.resolve(0);
