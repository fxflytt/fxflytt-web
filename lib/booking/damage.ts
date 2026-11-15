// Damage reports: something broken at a customer's move, or damage to one of our vehicles.
// The crew reports from their app (with photos); the office follows it up to a decision.
//   fx:dmg  [Damage, …]   (closed cases older than 3 years are dropped when saving)
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type DmgKind = "customer" | "vehicle";
export type DmgStatus = "new" | "handling" | "closed";
export const DMG_STATUS: Record<DmgStatus, string> = { new: "Ny", handling: "Utreds", closed: "Avslutad" };
export type PaidBy = "us" | "insurance" | "customer" | "none";
export const PAID_BY: Record<PaidBy, string> = { us: "Vi betalar", insurance: "Försäkringen", customer: "Kunden", none: "Ingen ersättning" };
export type Damage = {
  id: string; kind: DmgKind; date: string; title: string; desc: string; photos: string[];
  bookingId?: string; customer?: string;      // customer damage: the job it happened on
  vid?: string; vehicle?: string;             // vehicle damage (or the vehicle used on the job)
  status: DmgStatus; cost?: number; paidBy?: PaidBy; outcome?: string; claimNo?: string;
  createdBy: string; byCrew?: string; createdAt: number; updatedAt: number;
  log: { at: number; by: string; what: string }[];
};
const KEY = "fx:dmg";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_PHOTOS = 8;
const day = (n = 0) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");

export async function listDamages(): Promise<Damage[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Damage[]) : [];
}
async function saveAll(l: Damage[]) {
  const keep = Date.now() - 3 * 366 * 864e5;
  await kv(["SET", KEY, JSON.stringify(l.filter((d) => d.status !== "closed" || d.updatedAt >= keep))]);
}

export async function addDamage(d: Record<string, unknown>, by: string,
  ctx: { booking?: { id: string; name: string }; vehicle?: { id: string; name: string }; crewId?: string }): Promise<Damage> {
  const kind = d.kind as DmgKind;
  if (kind !== "customer" && kind !== "vehicle") throw new Error("Välj om det gäller kundens saker eller ett fordon.");
  if (kind === "customer" && !ctx.booking) throw new Error("Välj vilket jobb det gäller.");
  if (kind === "vehicle" && !ctx.vehicle) throw new Error("Välj vilket fordon det gäller.");
  const desc = str(d.desc, 2000), title = str(d.title, 100) || desc.split(/[.\n]/)[0].slice(0, 60);
  if (!desc) throw new Error("Beskriv vad som hände.");
  const date = typeof d.date === "string" && DATE.test(d.date) && d.date <= day(1) ? d.date : day(0);
  const list = await listDamages();
  if (ctx.crewId && list.filter((x) => x.byCrew === ctx.crewId && Date.now() - x.createdAt < 864e5).length >= 10) throw new Error("Du har redan rapporterat många skador i dag – ring kontoret.");
  const now = Date.now();
  const x: Damage = {
    id: "D" + randomBytes(5).toString("hex"), kind, date, title, desc, photos: [],
    ...(ctx.booking ? { bookingId: ctx.booking.id, customer: ctx.booking.name } : {}),
    ...(ctx.vehicle ? { vid: ctx.vehicle.id, vehicle: ctx.vehicle.name } : {}),
    status: "new", createdBy: by, ...(ctx.crewId ? { byCrew: ctx.crewId } : {}), createdAt: now, updatedAt: now,
    log: [{ at: now, by, what: "Rapporterad" }],
  };
  list.push(x); await saveAll(list);
  return x;
}

// Crew may add photos to their own report for a day; the office any time.
export async function addDamagePhoto(id: string, url: string, by: string, crewId?: string): Promise<Damage> {
  const list = await listDamages(), x = list.find((d) => d.id === id);
  if (!x || (crewId && (x.byCrew !== crewId || Date.now() - x.createdAt > 864e5))) throw new Error("Hittar inte skadan.");
  if (x.photos.length >= MAX_PHOTOS) throw new Error(`Högst ${MAX_PHOTOS} bilder.`);
  x.photos.push(url); x.updatedAt = Date.now();
  if (!crewId) x.log.push({ at: x.updatedAt, by, what: "Bild tillagd" });
  await saveAll(list);
  return x;
}

// Office: status, cost, who pays, insurance claim number, outcome, a note.
export async function updateDamage(id: string, d: Record<string, unknown>, by: string): Promise<Damage> {
  const list = await listDamages(), x = list.find((y) => y.id === id);
  if (!x) throw new Error("Hittar inte skadan.");
  const ch: string[] = [];
  if ("status" in d) {
    if (!((d.status as string) in DMG_STATUS)) throw new Error("Fel status.");
    if (d.status !== x.status) { x.status = d.status as DmgStatus; ch.push("Status: " + DMG_STATUS[x.status]); }
  }
  if ("cost" in d) {
    const c = d.cost === "" || d.cost == null ? undefined : Number(String(d.cost).replace(/\s/g, "").replace(",", "."));
    if (c !== undefined && !(isFinite(c) && c >= 0 && c < 1e7)) throw new Error("Kostnaden ser fel ut.");
    const r = c === undefined ? undefined : Math.round(c);
    if (r !== x.cost) { x.cost = r; ch.push(r === undefined ? "Kostnad borttagen" : `Kostnad ${r} kr`); }
  }
  if ("paidBy" in d) {
    const p = d.paidBy ? (d.paidBy as PaidBy) : undefined;
    if (p && !(p in PAID_BY)) throw new Error("Fel val.");
    if (p !== x.paidBy) { x.paidBy = p; if (p) ch.push(PAID_BY[p]); }
  }
  if ("claimNo" in d) { const c = str(d.claimNo, 40); if (c !== (x.claimNo || "")) { x.claimNo = c || undefined; if (c) ch.push("Skadenummer " + c); } }
  if ("outcome" in d) { const o = str(d.outcome, 1000); if (o !== (x.outcome || "")) { x.outcome = o || undefined; ch.push("Beslut/lösning uppdaterad"); } }
  if ("title" in d) { const t = str(d.title, 100); if (t && t !== x.title) { x.title = t; ch.push("Rubrik ändrad"); } }
  const note = str(d.note, 500);
  if (note) ch.push("Anteckning: " + note);
  if (!ch.length) return x;
  x.updatedAt = Date.now();
  for (const what of ch) x.log.push({ at: x.updatedAt, by, what });
  x.log = x.log.slice(-100);
  await saveAll(list);
  return x;
}

export async function removeDamage(id: string) {
  const list = await listDamages(), n = list.length, rest = list.filter((d) => d.id !== id);
  if (rest.length === n) throw new Error("Hittar inte skadan.");
  await saveAll(rest);
}
