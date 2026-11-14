// Owner reports: hours per person for a month (for salaries) and money per month.
// Hours: the real time from the job sheet (Start → Klart) when the crew used it, otherwise the planned length.
// Money: the customer's price after RUT (offer total) – what the customer pays FX Flytt directly.
import type { Booking } from "./store.ts";
import type { Resource } from "./team.ts";
import { schedule } from "./schedule.ts";
import { workedHours } from "./work.ts";

const r1 = (n: number) => Math.round(n * 10) / 10;
const booked = (b: Booking) => b.status === "signed" || b.status === "done";

export type HoursRow = {
  id: string; name: string; role: string; jobs: number; hours: number; realHours: number; plannedHours: number;
  lines: { date: string; time: string; bookingId: string; customer: string; hours: number; real: boolean; status: string }[];
};

export function hoursReport(all: Booking[], resources: Resource[], month: string): HoursRow[] {
  const people = resources.filter((r) => r.kind === "person");
  const rows = new Map<string, HoursRow>(people.map((r) => [r.id, { id: r.id, name: r.name, role: r.role || "", jobs: 0, hours: 0, realHours: 0, plannedHours: 0, lines: [] }]));
  for (const b of all) {
    if (!booked(b) || !b.date?.startsWith(month)) continue;
    const real = workedHours(b.work), h = real ?? schedule.hoursOf(b);
    for (const id of b.crew || []) {
      const row = rows.get(id); if (!row) continue;
      row.jobs++; row.hours += h; if (real != null) row.realHours += h; else row.plannedHours += h;
      row.lines.push({ date: b.date, time: b.time || "", bookingId: b.id, customer: b.data.name, hours: r1(h), real: real != null, status: b.status });
    }
  }
  return [...rows.values()].filter((r) => r.jobs > 0 || people.find((p) => p.id === r.id)?.active)
    .map((r) => ({ ...r, hours: r1(r.hours), realHours: r1(r.realHours), plannedHours: r1(r.plannedHours), lines: r.lines.sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time)) }))
    .sort((a, b) => b.hours - a.hours || a.name.localeCompare(b.name));
}

// Excel-friendly (Swedish Excel: semicolon, decimal comma, BOM so å/ä/ö show right).
export function hoursCsv(rows: HoursRow[], month: string): string {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`, n = (x: number) => String(x).replace(".", ",");
  const out = [["Timrapport " + month], [], ["Namn", "Roll", "Jobb", "Timmar totalt", "varav uppmätta (Start–Klart)", "varav planerade"]];
  for (const r of rows) out.push([r.name, r.role, String(r.jobs), n(r.hours), n(r.realHours), n(r.plannedHours)]);
  out.push([], ["Namn", "Datum", "Start", "Bokning", "Kund", "Timmar", "Källa"]);
  for (const r of rows) for (const l of r.lines) out.push([r.name, l.date, l.time, l.bookingId, l.customer, n(l.hours), l.real ? "uppmätt" : "planerad"]);
  return "﻿" + out.map((row) => row.map(q).join(";")).join("\r\n");
}

export type Money = {
  months: { month: string; done: number; doneJobs: number; booked: number; bookedJobs: number }[];
  thisMonth: { done: number; doneJobs: number; booked: number }; lastMonth: { done: number; doneJobs: number };
  upcoming: { total: number; jobs: number }; openOffers: { total: number; count: number }; avgJob: number;
};

export function moneyReport(all: Booking[], today: string, nMonths = 12): Money {
  const total = (b: Booking) => b.offer?.total || 0;
  const mk = (d: string) => d.slice(0, 7);
  const cur = mk(today), [y, m] = cur.split("-").map(Number);
  const months = [...Array(nMonths)].map((_, i) => { const d = new Date(Date.UTC(y, m - nMonths + i, 1)); return d.toISOString().slice(0, 7); });
  const rows = months.map((month) => {
    const l = all.filter((b) => b.date && mk(b.date) === month);
    const done = l.filter((b) => b.status === "done"), bk = l.filter(booked);
    return { month, done: done.reduce((a, b) => a + total(b), 0), doneJobs: done.length, booked: bk.reduce((a, b) => a + total(b), 0), bookedJobs: bk.length };
  });
  const last = rows[rows.length - 2] || { done: 0, doneJobs: 0 }, now = rows[rows.length - 1];
  const up = all.filter((b) => booked(b) && b.status === "signed" && b.date && b.date >= today);
  const open = all.filter((b) => b.status === "sent" && !(b.date && b.date <= today) && !(b.sentAt && Date.now() - b.sentAt > 14 * 864e5));
  const doneAll = all.filter((b) => b.status === "done" && b.date && mk(b.date) >= months[0]);
  return {
    months: rows,
    thisMonth: { done: now.done, doneJobs: now.doneJobs, booked: now.booked },
    lastMonth: { done: last.done, doneJobs: last.doneJobs },
    upcoming: { total: up.reduce((a, b) => a + total(b), 0), jobs: up.length },
    openOffers: { total: open.reduce((a, b) => a + total(b), 0), count: open.length },
    avgJob: doneAll.length ? Math.round(doneAll.reduce((a, b) => a + total(b), 0) / doneAll.length) : 0,
  };
}
