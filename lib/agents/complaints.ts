// Klagomål – the complaints desk. A complaint comes from the inbox (the AI sorts it out of info@) or is typed in by
// the office after a phone call. The AI reads it, says how serious it is, what the next step is, and writes a reply
// for the office to check. It never answers by itself and never promises money: the office decides.
//   fx:klag  [Complaint, …]   (closed complaints older than 3 years are dropped when saving)
import { randomBytes } from "node:crypto";
import { kv } from "../booking/kv.ts";
import { askJson, MODEL_WRITE, HOUSE_RULES, quote, type JsonSchema } from "./claude.ts";
import type { Booking } from "../booking/store.ts";

export type KCat = "damage" | "delay" | "price" | "staff" | "cleaning" | "missing" | "other";
export const K_CATS: Record<KCat, string> = {
  damage: "Skada på saker eller bostad", delay: "Försening / tider", price: "Pris eller faktura", staff: "Personalens bemötande",
  cleaning: "Flyttstäd", missing: "Något saknas", other: "Annat",
};
export type KSev = "low" | "medium" | "high";
export const K_SEV: Record<KSev, string> = { low: "Låg", medium: "Medel", high: "Hög" };
export type KStatus = "new" | "handling" | "closed";
export const K_STATUS: Record<KStatus, string> = { new: "Ny", handling: "Hanteras", closed: "Avslutad" };

export type Complaint = {
  id: string; createdAt: number; updatedAt: number; status: KStatus;
  source: "email" | "phone" | "other";
  name: string; email: string; phone: string;
  bookingId?: string; mailId?: string;
  subject: string; text: string;
  category: KCat; severity: KSev; summary: string; nextStep: string; draft: string;
  deadline: string;               // answer the customer by this day (YYYY-MM-DD, Stockholm)
  resolution?: string; damageId?: string;
  log: { at: number; by: string; what: string }[];
};

const KEY = "fx:klag";
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
export const sthlmDay = (ts: number) => new Date(ts).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
// Serious complaints are answered within one working day, the rest within three.
export function deadlineFor(sev: KSev, from: number): string {
  let d = new Date(sthlmDay(from) + "T12:00:00Z"), left = sev === "high" ? 1 : 3;
  while (left > 0) { d = new Date(d.getTime() + 864e5); const w = d.getUTCDay(); if (w !== 0 && w !== 6) left--; }
  return d.toISOString().slice(0, 10);
}

export async function listComplaints(): Promise<Complaint[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Complaint[]) : [];
}
async function saveAll(l: Complaint[]) {
  const keep = Date.now() - 3 * 366 * 864e5;
  await kv(["SET", KEY, JSON.stringify(l.filter((c) => c.status !== "closed" || c.updatedAt >= keep).slice(-1000))]);
}

// ---------- the AI's assessment ----------
export type Assessment = { category: KCat; severity: KSev; summary: string; nextStep: string; draft: string };
const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["category", "severity", "summary", "nextStep", "draft"],
  properties: {
    category: { type: "string", enum: Object.keys(K_CATS) },
    severity: { type: "string", enum: Object.keys(K_SEV), description: "high = skada, stöld, hot om att gå vidare (ARN, advokat, polis, media, recension), mycket arg kund eller krav på pengar. low = liten synpunkt." },
    summary: { type: "string", description: "1–2 meningar på svenska till kontoret: vad kunden klagar på och vad kunden vill." },
    nextStep: { type: "string", description: "Konkret nästa steg för kontoret på svenska, t.ex. 'Ring kunden i dag, be om bilder på skadan, lägg in skaderapport'." },
    draft: { type: "string", description: "Svar till kunden, högst 110 ord. Tacka, visa förståelse, säg vad som händer nu och när kunden hör av oss. Ingen skuld, inga löften om ersättning." },
  },
};
export function bookingContext(b: Booking | null): string {
  if (!b) return "Ingen bokning hittad för kunden.";
  return [
    `Bokning ${b.id}, status ${b.status}`, b.date ? `flyttdag ${b.date}${b.time ? " kl. " + b.time : ""}` : "",
    b.data.from || b.data.to ? `${b.data.from || "?"} → ${b.data.to || "?"}` : "", b.offer ? `pris efter RUT ${b.offer.total} kr` : "",
    b.offer?.lines?.length ? "rader: " + b.offer.lines.map((l) => l.label).join(", ") : "",
  ].filter(Boolean).join(" · ");
}
export async function assess(text: string, subject: string, b: Booking | null): Promise<Assessment> {
  const a = await askJson<Assessment>({
    model: MODEL_WRITE, effort: "medium", schema: SCHEMA, maxTokens: 6000,
    system: `${HOUSE_RULES}\n\nDu är klagomålsansvarig. Läs klagomålet, bedöm det och skriv ett svar som kontoret kan skicka efter granskning.`,
    user: `${quote("underlag", bookingContext(b))}\n\n${quote("mejl", `Ämne: ${subject}\n\n${text}`)}`,
  });
  return cleanAssessment(a);
}
export function cleanAssessment(a: Partial<Assessment>): Assessment {
  return {
    category: (a.category && a.category in K_CATS ? a.category : "other") as KCat,
    severity: (a.severity && a.severity in K_SEV ? a.severity : "medium") as KSev,
    summary: str(a.summary, 600), nextStep: str(a.nextStep, 600), draft: str(a.draft, 4000),
  };
}

// ---------- create / update ----------
export async function addComplaint(d: {
  source: Complaint["source"]; name?: string; email?: string; phone?: string; bookingId?: string; mailId?: string;
  subject?: string; text: string; assessment?: Assessment | null; by: string;
}): Promise<Complaint> {
  const text = str(d.text, 8000);
  if (!text) throw new Error("Skriv vad kunden klagar på.");
  const now = Date.now(), a = d.assessment || cleanAssessment({});
  const c: Complaint = {
    id: "K" + randomBytes(5).toString("hex"), createdAt: now, updatedAt: now, status: "new", source: d.source,
    name: str(d.name, 120), email: str(d.email, 200).toLowerCase(), phone: str(d.phone, 40),
    ...(d.bookingId ? { bookingId: d.bookingId } : {}), ...(d.mailId ? { mailId: d.mailId } : {}),
    subject: str(d.subject, 200) || text.split(/[.\n]/)[0].slice(0, 80), text,
    ...a, deadline: deadlineFor(a.severity, now),
    log: [{ at: now, by: d.by, what: d.source === "email" ? "Kom in via e-post" : "Registrerad av kontoret" }],
  };
  const list = await listComplaints();
  list.push(c); await saveAll(list);
  return c;
}

export async function updateComplaint(id: string, fn: (c: Complaint) => string | void, by: string): Promise<Complaint> {
  const list = await listComplaints(), c = list.find((x) => x.id === id);
  if (!c) throw new Error("Hittar inte klagomålet.");
  const what = fn(c);
  c.updatedAt = Date.now();
  if (what) c.log = [...c.log, { at: c.updatedAt, by, what }].slice(-80);
  await saveAll(list);
  return c;
}

export async function removeComplaint(id: string) {
  await saveAll((await listComplaints()).filter((c) => c.id !== id));
}

export function applyPatch(c: Complaint, d: Record<string, unknown>): string {
  const out: string[] = [];
  if (typeof d.status === "string" && d.status in K_STATUS && d.status !== c.status) {
    c.status = d.status as KStatus; out.push("Status: " + K_STATUS[c.status]);
  }
  if (typeof d.severity === "string" && d.severity in K_SEV && d.severity !== c.severity) {
    c.severity = d.severity as KSev; c.deadline = deadlineFor(c.severity, c.createdAt); out.push("Allvar: " + K_SEV[c.severity]);
  }
  if (typeof d.category === "string" && d.category in K_CATS && d.category !== c.category) { c.category = d.category as KCat; out.push("Typ: " + K_CATS[c.category]); }
  if ("resolution" in d) { c.resolution = str(d.resolution, 1000); out.push("Lösning: " + (c.resolution || "–")); }
  if ("draft" in d) c.draft = str(d.draft, 4000);
  if (typeof d.note === "string" && d.note.trim()) out.push("Anteckning: " + str(d.note, 500));
  if (c.status === "closed" && !c.resolution) throw new Error("Skriv kort hur det löstes innan du avslutar.");
  return out.join(" · ");
}
