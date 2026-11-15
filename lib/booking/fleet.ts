// Vehicles: reminders (besiktning, service, insurance, tyre change) and a log of fuel and other costs.
// The crew can log fuel from their app (amount, litres, odometer, receipt photo); the office sees it all.
//   fx:fleet  { v: { <vehicle id>: VInfo }, log: LogEntry[] }
// The vehicles themselves (name, colour, archived) live in fx:res (team.ts).
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type DueKind = "besiktning" | "service" | "insurance" | "tires";
export const DUE: Record<DueKind, { label: string; months: number }> = {
  besiktning: { label: "Besiktning", months: 12 },
  service: { label: "Service", months: 12 },
  insurance: { label: "Försäkring", months: 12 },
  tires: { label: "Däckbyte", months: 6 },
};
export type LogKind = "fuel" | DueKind | "repair" | "other";
export const LOG_KINDS: Record<LogKind, string> = {
  fuel: "Tankning", besiktning: "Besiktning", service: "Service", insurance: "Försäkring", tires: "Däckbyte", repair: "Reparation", other: "Övrigt",
};
export type VInfo = {
  reg?: string;
  km?: number; kmAt?: number;                    // last known odometer
  due: Partial<Record<DueKind, string>>;         // next date, YYYY-MM-DD
  serviceKm?: number;                            // next service at this odometer reading
  serviceEveryKm?: number;                       // e.g. 20000 – sets serviceKm when a service is logged
};
export type LogEntry = {
  id: string; vid: string; kind: LogKind; date: string; kr: number;
  liters?: number; km?: number; note: string; photo?: string; by: string; byCrew?: string; at: number;
};
export type Fleet = { v: Record<string, VInfo>; log: LogEntry[] };

const KEY = "fx:fleet";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const SOON_DAYS = 30, SOON_KM = 1500;
const day = (n = 0) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const num = (v: unknown, max: number) => { if (v === "" || v == null) return undefined; const n = typeof v === "string" ? Number(v.replace(",", ".").replace(/\s/g, "")) : v; return typeof n === "number" && isFinite(n) && n >= 0 && n <= max ? n : undefined; };
const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
export const addMonths = (d: string, m: number) => { const x = new Date(d + "T12:00:00Z"); x.setUTCMonth(x.getUTCMonth() + m); return x.toISOString().slice(0, 10); };

export async function getFleet(): Promise<Fleet> {
  const s = await kv<string | null>(["GET", KEY]);
  const f = s ? (JSON.parse(s) as Fleet) : { v: {}, log: [] };
  f.v ||= {}; f.log ||= [];
  return f;
}
async function save(f: Fleet) {
  const keep = day(-3 * 366);   // three years of costs
  f.log = f.log.filter((e) => e.date >= keep).slice(-5000);
  await kv(["SET", KEY, JSON.stringify(f)]);
}
const info = (f: Fleet, vid: string) => (f.v[vid] ||= { due: {} });

// Office: reg.nr, odometer, next dates, service interval.
export async function setVehicle(vid: string, d: Record<string, unknown>): Promise<VInfo> {
  const f = await getFleet(), v = info(f, vid);
  if ("reg" in d) v.reg = str(d.reg, 12).toUpperCase();
  if ("km" in d) { const k = num(d.km, 3e6); if (k === undefined && d.km !== "" && d.km != null) throw new Error("Mätarställningen ser fel ut."); v.km = k; v.kmAt = k === undefined ? undefined : Date.now(); }
  if ("serviceKm" in d) v.serviceKm = num(d.serviceKm, 3e6);
  if ("serviceEveryKm" in d) v.serviceEveryKm = num(d.serviceEveryKm, 2e5);
  if (d.due && typeof d.due === "object") {
    for (const k of Object.keys(DUE) as DueKind[]) {
      if (!(k in (d.due as object))) continue;
      const x = (d.due as Record<string, unknown>)[k];
      if (x === "" || x == null) delete v.due[k];
      else if (typeof x === "string" && DATE.test(x)) v.due[k] = x;
      else throw new Error("Fel datum för " + DUE[k].label.toLowerCase() + ".");
    }
  }
  await save(f);
  return v;
}

// A cost or a done reminder. Logging besiktning/service/insurance/tyres moves that reminder forward
// (to `next` if given, else date + the usual interval). A higher odometer reading updates the vehicle.
export async function addLog(vid: string, d: Record<string, unknown>, by: string, byCrew?: string): Promise<LogEntry> {
  const kind = d.kind as LogKind;
  if (!(kind in LOG_KINDS)) throw new Error("Välj vad det gäller.");
  const date = typeof d.date === "string" && DATE.test(d.date) ? d.date : day(0);
  if (date > day(1)) throw new Error("Datumet har inte varit än.");
  const kr = num(d.kr, 1e6), liters = num(d.liters, 2000), km = num(d.km, 3e6);
  if (kind === "fuel" && !kr) throw new Error("Skriv beloppet.");
  if (kr === undefined && d.kr !== "" && d.kr != null) throw new Error("Beloppet ser fel ut.");
  const f = await getFleet(), v = info(f, vid);
  if (km !== undefined && v.km !== undefined && km < v.km - 50 && byCrew) throw new Error(`Mätarställningen är lägre än förra gången (${v.km} km).`);
  const e: LogEntry = {
    id: "L" + randomBytes(5).toString("hex"), vid, kind, date, kr: Math.round(kr || 0),
    ...(liters ? { liters: Math.round(liters * 100) / 100 } : {}), ...(km !== undefined ? { km: Math.round(km) } : {}),
    note: str(d.note, 300), by, ...(byCrew ? { byCrew } : {}), at: Date.now(),
  };
  if (km !== undefined && (v.km === undefined || km >= v.km)) { v.km = e.km; v.kmAt = Date.now(); }
  if (kind in DUE) {
    const k = kind as DueKind, next = typeof d.next === "string" && DATE.test(d.next) ? d.next : addMonths(date, DUE[k].months);
    v.due[k] = next;
    if (k === "service" && v.serviceEveryKm && e.km !== undefined) v.serviceKm = e.km + v.serviceEveryKm;
  }
  f.log.push(e);
  await save(f);
  return e;
}

export async function setLogPhoto(id: string, url: string, crewId?: string) {
  const f = await getFleet(), e = f.log.find((x) => x.id === id);
  if (!e || (crewId && (e.byCrew !== crewId || Date.now() - e.at > 864e5))) throw new Error("Hittar inte posten.");
  e.photo = url; await save(f);
}

export async function removeLog(id: string) {
  const f = await getFleet(), n = f.log.length;
  f.log = f.log.filter((e) => e.id !== id);
  if (f.log.length === n) throw new Error("Hittar inte posten.");
  await save(f);
}

// What needs doing soon (or is late) – for Idag and the morning notification.
export type DueItem = { vid: string; name: string; kind: DueKind; label: string; date?: string; km?: number; days?: number; kmLeft?: number; late: boolean };
export function dueSoon(f: Fleet, vehicles: { id: string; name: string; active: boolean; kind: string }[], today = day(0)): DueItem[] {
  const out: DueItem[] = [];
  for (const r of vehicles) {
    if (r.kind !== "vehicle" || !r.active) continue;
    const v = f.v[r.id]; if (!v) continue;
    for (const k of Object.keys(DUE) as DueKind[]) {
      const d = v.due[k]; if (!d) continue;
      const days = Math.round((Date.parse(d) - Date.parse(today)) / 864e5);
      if (days <= SOON_DAYS) out.push({ vid: r.id, name: r.name, kind: k, label: DUE[k].label, date: d, days, late: days < 0 });
    }
    if (v.serviceKm && v.km !== undefined && v.serviceKm - v.km <= SOON_KM && !out.some((x) => x.vid === r.id && x.kind === "service"))
      out.push({ vid: r.id, name: r.name, kind: "service", label: "Service", km: v.serviceKm, kmLeft: v.serviceKm - v.km, late: v.km >= v.serviceKm });
  }
  return out.sort((a, b) => Number(b.late) - Number(a.late) || (a.days ?? 0) - (b.days ?? 0));
}

// Costs and fuel use per vehicle for a period (dates inclusive).
export function costs(f: Fleet, from: string, to: string) {
  const per: Record<string, { kr: number; fuelKr: number; liters: number; byKind: Partial<Record<LogKind, number>>; l100?: number }> = {};
  for (const e of f.log) {
    if (e.date < from || e.date > to) continue;
    const p = (per[e.vid] ||= { kr: 0, fuelKr: 0, liters: 0, byKind: {} });
    p.kr += e.kr; p.byKind[e.kind] = (p.byKind[e.kind] || 0) + e.kr;
    if (e.kind === "fuel") { p.fuelKr += e.kr; p.liters += e.liters || 0; }
  }
  // Litres per 100 km: between the first and last fill-up with an odometer reading (the first fill-up's litres excluded).
  for (const [vid, p] of Object.entries(per)) {
    const fills = f.log.filter((e) => e.vid === vid && e.kind === "fuel" && e.km !== undefined && e.liters && e.date >= from && e.date <= to).sort((a, b) => a.km! - b.km!);
    if (fills.length >= 2) {
      const dist = fills[fills.length - 1].km! - fills[0].km!, l = fills.slice(1).reduce((a, e) => a + (e.liters || 0), 0);
      if (dist > 50) p.l100 = Math.round((l / dist) * 1000) / 10;
    }
  }
  return per;
}
