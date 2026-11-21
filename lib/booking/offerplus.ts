// The offer, made more personal and clearer for the customer:
//   - end date: the price holds for `offerValidDays` days (never past the day before the move)
//   - the seller's greeting at the top, with photo, title and phone (profile per admin user)
//   - questions the customer asks in the offer, answered from the admin page (e-mail or SMS back)
//   fx:prof   hash  <user id> → Profile
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";
import type { Booking, Intro, QA } from "./store.ts";
import type { Settings } from "./settings.ts";

export type Profile = { name: string; title: string; phone: string; photo: string };
const PK = "fx:prof";
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[<>]/g, "").trim().slice(0, max) : "");
export const today = (t = Date.now()) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
export const addDays = (d: string, n: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- end date ----
/** The end date when the offer is sent: `days` from today, but not past the day before the move
 *  (and never before today). A later date the office already set by hand is kept. 0 days = no end date. */
export function validFor(b: Pick<Booking, "date" | "validUntil">, days: number, now = Date.now()): string | undefined {
  if (!(days > 0)) return b.validUntil && b.validUntil >= today(now) ? b.validUntil : undefined;
  const t = today(now);
  let d = addDays(t, days);
  if (b.date && DATE.test(b.date)) { const before = addDays(b.date, -1); if (before < d) d = before < t ? t : before; }
  return b.validUntil && b.validUntil > d ? b.validUntil : d;
}
export function setValidUntil(b: Booking, v: unknown): string {
  if (v === "" || v == null) { b.validUntil = undefined; return "Offerten gäller tills vidare"; }
  if (typeof v !== "string" || !DATE.test(v)) throw new Error("Välj ett datum.");
  if (v < today()) throw new Error("Datumet har redan varit.");
  b.validUntil = v; b.renewAskedAt = undefined;
  return "Offerten gäller till " + v;
}

// ---- seller profile and greeting ----
export async function getProfile(uid: string, fallbackName: string): Promise<Profile> {
  const s = await kv<string | null>(["HGET", PK, uid]);
  const p = s ? (JSON.parse(s) as Partial<Profile>) : {};
  return { name: p.name || (fallbackName === "Ägaren" ? "" : fallbackName), title: p.title || "", phone: p.phone || "", photo: p.photo || "" };
}
export async function setProfile(uid: string, d: Record<string, unknown>, fallbackName: string): Promise<Profile> {
  const p = await getProfile(uid, fallbackName);
  if ("name" in d) p.name = str(d.name, 60);
  if ("title" in d) p.title = str(d.title, 60);
  if ("phone" in d) { const t = str(d.phone, 30); if (t && !/^[+\d][\d\s-]{5,20}$/.test(t)) throw new Error("Telefonnumret ser fel ut."); p.phone = t; }
  if ("photo" in d) { const u = str(d.photo, 500); if (u && !/^(https:\/\/|\/api\/foto\?k=)/.test(u)) throw new Error("Fel bildadress."); p.photo = u; }
  await kv(["HSET", PK, uid, JSON.stringify(p)]);
  return p;
}

const first = (n: string) => (n || "").trim().split(/\s+/)[0] || "";
const town = (a?: string) => { const parts = (a || "").split(",").map((x) => x.replace(/\d{3}\s?\d{2}/g, "").trim()).filter(Boolean); return parts[parts.length - 1] || ""; };
const longDate = (d?: string) => (d && DATE.test(d) ? new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { day: "numeric", month: "long", timeZone: "UTC" }) : "");
/** The greeting from the template, with the customer's details filled in. Phrases whose detail is missing are left out. */
export function fillIntro(tpl: string, b: Booking, seller: string): string {
  const from = town(b.data.from), to = town(b.data.to);
  let t = tpl;
  if (!from || !to) t = t.replace(/\s*från \{från\} till \{till\}/g, "");
  if (!b.date) t = t.replace(/\s*den \{datum\}/g, "");
  return t.replace(/\{förnamn\}/g, first(b.data.name)).replace(/\{från\}/g, from).replace(/\{till\}/g, to)
    .replace(/\{datum\}/g, longDate(b.date)).replace(/\{säljare\}/g, seller).replace(/\n{3,}/g, "\n\n").trim();
}
export function makeIntro(text: string, uid: string, p: Profile, fallbackName: string): Intro {
  const t = String(text || "").replace(/\r/g, "").replace(/[<>]/g, "").trim().slice(0, 800);
  if (t.length < 5) throw new Error("Skriv ett meddelande (minst några ord).");
  return { text: t, uid, name: p.name || fallbackName, ...(p.title ? { title: p.title } : {}), ...(p.phone ? { phone: p.phone } : {}), ...(p.photo ? { photo: p.photo } : {}), at: Date.now() };
}
/** On send: give the offer the seller's greeting from the template, if it has none and greetings are on. */
export async function ensureIntro(b: Booking, s: Settings, uid: string, uname: string) {
  if (b.intro || !s.introOn) return;
  const p = await getProfile(uid, uname);
  b.intro = makeIntro(fillIntro(s.introTpl, b, p.name || uname), uid, p, p.name || "FX Flytt");
}

// ---- questions in the offer ----
export const MAX_QA = 20;
export function addQuestion(b: Booking, text: unknown): QA {
  const q = typeof text === "string" ? text.replace(/\r/g, "").replace(/[<>]/g, "").trim().slice(0, 1000) : "";
  if (q.length < 3) throw new Error("Skriv din fråga.");
  if ((b.qa || []).length >= MAX_QA) throw new Error("Du har ställt många frågor – ring oss på 076-300 07 23 så hjälper vi dig.");
  if ((b.qa || []).some((x) => x.q === q && !x.a)) throw new Error("Vi har redan fått den frågan och svarar så snart vi kan.");
  const x: QA = { id: "Q" + randomBytes(4).toString("hex"), q, at: Date.now() };
  b.qa = [...(b.qa || []), x];
  return x;
}
export function answerQuestion(b: Booking, qid: unknown, text: unknown, by: string): QA {
  const x = (b.qa || []).find((y) => y.id === qid);
  if (!x) throw new Error("Hittar inte frågan.");
  const a = typeof text === "string" ? text.replace(/\r/g, "").replace(/[<>]/g, "").trim().slice(0, 1500) : "";
  if (a.length < 2) throw new Error("Skriv ett svar.");
  x.a = a; x.aAt = Date.now(); x.aBy = by;
  return x;
}
export const openQuestions = (b: Pick<Booking, "qa">) => (b.qa || []).filter((x) => !x.a).length;
