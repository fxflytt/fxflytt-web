// Tidrapporter: one row per person and working day, built from what we know about that day –
//   planned:  the person's booked jobs (first start → last end)
//   stamped:  the time clock (Stämpelklocka), first clock-in → last clock-out
//   sheet:    the job sheet (Start → Klart) when the crew used it
// The office checks the row, corrects the time if needed and approves it. Approved time is what is paid.
// A break is deducted automatically when the day is longer than the setting (breakAfterH → breakMin).
//   fx:ts:<YYYY-MM>   hash  "<rid>|<date>" → Approved
import { kv } from "./kv.ts";
import type { Booking } from "./store.ts";
import type { Resource } from "./team.ts";
import type { Shift } from "./clock.ts";
import { schedule } from "./schedule.ts";

export type Approved = { rid: string; date: string; start: string; end: string; breakMin: number; note?: string; by: string; at: number };
export type Span = { start: string; end: string };
export type TsRow = {
  rid: string; name: string; date: string;
  planned?: Span & { jobs: { id: string; customer: string; time: string }[] };
  stamped?: { start: string; end?: string };
  sheet?: Span;
  proposed: Span & { breakMin: number; from: "stamp" | "sheet" | "plan" };
  approved?: Approved;
  flags: string[];
  paidMin: number;
};
export type BreakRule = { breakAfterH: number; breakMin: number };

const MK = (month: string) => `fx:ts:${month}`;
const HM = /^([01]\d|2[0-3]):[0-5]\d$/, DATE = /^\d{4}-\d{2}-\d{2}$/;
export const DIFF_MIN = 30;   // planned vs stamped more than this apart → flag
const hm = (t: number) => new Date(t).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" });
export const toMin = (s: string) => Number(s.slice(0, 2)) * 60 + Number(s.slice(3, 5));
const minHM = (m: number) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");

export const breakFor = (minutes: number, r: BreakRule) => (r.breakMin > 0 && minutes > r.breakAfterH * 60 ? r.breakMin : 0);
// Minutes between two clock times; an end before the start means it ended after midnight.
export const lengthMin = (start: string, end: string) => { const d = toMin(end) - toMin(start); return d >= 0 ? d : d + 1440; };
export const paidMin = (start: string, end: string, breakMin: number) => Math.max(0, lengthMin(start, end) - breakMin);

export async function approvedIn(month: string): Promise<Approved[]> {
  const h = await kv<string[]>(["HGETALL", MK(month)]);
  const out: Approved[] = [];
  for (let i = 1; i < (h || []).length; i += 2) out.push(JSON.parse(h[i]));
  return out;
}
export async function approvedBetween(from: string, to: string): Promise<Approved[]> {
  const months = new Set<string>(); for (let d = from; d <= to; d = addDay(d)) months.add(d.slice(0, 7));
  return (await Promise.all([...months].map(approvedIn))).flat().filter((a) => a.date >= from && a.date <= to);
}
export const addDay = (d: string, n = 1) => { const x = new Date(d + "T12:00:00Z"); x.setUTCDate(x.getUTCDate() + n); return x.toISOString().slice(0, 10); };

export async function approve(d: Record<string, unknown>, name: string, by: string): Promise<Approved> {
  const date = String(d.date || ""), start = String(d.start || ""), end = String(d.end || "");
  if (!DATE.test(date)) throw new Error("Ogiltigt datum.");
  if (!HM.test(start) || !HM.test(end)) throw new Error(`${name}: ange start- och sluttid (tt:mm).`);
  const len = lengthMin(start, end), brk = Math.round(Number(d.breakMin ?? 0));
  if (len === 0 || len > 16 * 60) throw new Error(`${name}: ${start}–${end} ser fel ut.`);
  if (!(brk >= 0 && brk < len)) throw new Error(`${name}: rasten är längre än passet.`);
  const a: Approved = { rid: String(d.rid), date, start, end, breakMin: brk, ...(d.note ? { note: String(d.note).trim().slice(0, 200) } : {}), by, at: Date.now() };
  await kv(["HSET", MK(date.slice(0, 7)), `${a.rid}|${date}`, JSON.stringify(a)]);
  return a;
}
export async function unapprove(rid: string, date: string) {
  if (!DATE.test(date)) throw new Error("Ogiltigt datum.");
  await kv(["HDEL", MK(date.slice(0, 7)), `${rid}|${date}`]);
}

// All rows for the period: every person with a booked job, a stamp or an approved time that day.
export function buildRows(all: Booking[], resources: Resource[], shifts: Shift[], approved: Approved[], from: string, to: string, rule: BreakRule, clockOn = true): TsRow[] {
  const people = new Map(resources.filter((r) => r.kind === "person").map((r) => [r.id, r]));
  const rows = new Map<string, TsRow>();
  const row = (rid: string, date: string): TsRow | null => {
    const p = people.get(rid); if (!p) return null;
    const k = rid + "|" + date;
    if (!rows.has(k)) rows.set(k, { rid, name: p.name, date, flags: [], paidMin: 0, proposed: { start: "", end: "", breakMin: 0, from: "plan" } });
    return rows.get(k)!;
  };
  for (const b of all) {
    if (!(b.status === "signed" || b.status === "done") || !b.date || b.date < from || b.date > to) continue;
    const s = schedule.span(b); if (!s) continue;
    for (const id of b.crew || []) {
      const r = row(id, b.date); if (!r) continue;
      const st = minHM(s.start), en = minHM(Math.min(s.end, 1439));
      const p = r.planned ||= { start: st, end: en, jobs: [] };
      if (s.allDay) p.jobs.push({ id: b.id, customer: b.data.name, time: "" });
      else { if (toMin(st) < toMin(p.start) || !p.jobs.some((j) => j.time)) p.start = st; if (toMin(en) > toMin(p.end) || !p.jobs.some((j) => j.time)) p.end = en; p.jobs.push({ id: b.id, customer: b.data.name, time: b.time || "" }); }
      const w = b.work;
      if (w?.startedAt && w.finishedAt) {
        const ws = hm(w.startedAt), we = hm(w.finishedAt);
        if (!r.sheet) r.sheet = { start: ws, end: we };
        else { if (toMin(ws) < toMin(r.sheet.start)) r.sheet.start = ws; if (toMin(we) > toMin(r.sheet.end)) r.sheet.end = we; }
      }
    }
  }
  for (const sh of shifts) {
    if (sh.date < from || sh.date > to) continue;
    const r = row(sh.rid, sh.date); if (!r) continue;
    const st = hm(sh.in), en = sh.out ? hm(sh.out) : undefined;
    if (!r.stamped) r.stamped = { start: st, end: en };
    else {
      if (toMin(st) < toMin(r.stamped.start)) r.stamped.start = st;
      if (!en) r.flags.includes("open") || r.flags.push("open");
      else if (!r.stamped.end || toMin(en) > toMin(r.stamped.end)) r.stamped.end = en;
    }
    if (!en && !r.flags.includes("open")) r.flags.push("open");
  }
  for (const a of approved) { const r = row(a.rid, a.date); if (r) r.approved = a; }
  for (const r of rows.values()) {
    const src: TsRow["proposed"]["from"] = r.stamped?.end ? "stamp" : r.sheet ? "sheet" : "plan";
    const base = src === "stamp" ? { start: r.stamped!.start, end: r.stamped!.end! } : src === "sheet" ? r.sheet! : r.planned ? { start: r.planned.start, end: r.planned.end } : { start: r.stamped?.start || "", end: "" };
    const len = base.start && base.end ? lengthMin(base.start, base.end) : 0;
    r.proposed = { ...base, breakMin: breakFor(len, rule), from: src };
    if (r.planned && r.stamped?.end && r.planned.jobs.some((j) => j.time)) {
      if (Math.abs(toMin(r.stamped.start) - toMin(r.planned.start)) > DIFF_MIN || Math.abs(toMin(r.stamped.end) - toMin(r.planned.end)) > DIFF_MIN) r.flags.push("diff");
    }
    if (clockOn && r.planned && !r.stamped && r.date < todayStr()) r.flags.push("nostamp");
    if (r.stamped && !r.planned) r.flags.push("nojob");
    const t = r.approved || (r.proposed.start && r.proposed.end ? r.proposed : null);
    r.paidMin = t ? paidMin(t.start, t.end, t.breakMin) : 0;
  }
  return [...rows.values()].sort((a, b) => a.date.localeCompare(b.date) || a.name.localeCompare(b.name));
}
const todayStr = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
