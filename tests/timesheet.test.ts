import { test } from "node:test";
import assert from "node:assert/strict";
import { buildRows, breakFor, paidMin, lengthMin } from "../lib/booking/timesheet.ts";

const rule = { breakAfterH: 5, breakMin: 30 };
const P = (id: string, name: string) => ({ id, name, kind: "person", color: "#000", active: true, createdAt: 0 }) as never;
const res = [P("RA", "Ahmad"), P("RB", "Sara")];
const ts = (d: string, hm: string) => Date.parse(`${d}T${hm}:00+01:00`);   // November: UTC+1
const job = (id: string, crew: string[], time: string, h: number, extra = {}) =>
  ({ id, status: "signed", date: "2026-11-11", time, durationH: h, crew, data: { name: "Kund " + id }, ...extra }) as never;

test("rast och betald tid", () => {
  assert.equal(breakFor(5 * 60, rule), 0);
  assert.equal(breakFor(5 * 60 + 1, rule), 30);
  assert.equal(paidMin("07:00", "16:00", 30), 510);
  assert.equal(lengthMin("22:00", "02:00"), 240);
});

test("en rad per person och dag: stämpling går före plan, flaggor", () => {
  const all = [job("J1", ["RA", "RB"], "08:00", 4), job("J2", ["RA"], "13:00", 3)];
  const shifts = [{ id: "S1", rid: "RA", name: "Ahmad", date: "2026-11-11", in: ts("2026-11-11", "07:05"), out: ts("2026-11-11", "16:40"), log: [] }] as never[];
  const rows = buildRows(all, res, shifts, [], "2026-11-09", "2026-11-15", rule, true);
  assert.equal(rows.length, 2);
  const a = rows.find((r) => r.rid === "RA")!, b = rows.find((r) => r.rid === "RB")!;
  assert.deepEqual([a.planned!.start, a.planned!.end, a.planned!.jobs.length], ["08:00", "16:00", 2]);
  assert.deepEqual([a.proposed.start, a.proposed.end, a.proposed.breakMin, a.proposed.from], ["07:05", "16:40", 30, "stamp"]);
  assert.ok(a.flags.includes("diff"));                // 55 min before the plan
  assert.equal(a.paidMin, 9 * 60 + 35 - 30);
  assert.deepEqual([b.proposed.start, b.proposed.end, b.proposed.breakMin, b.proposed.from], ["08:00", "12:00", 0, "plan"]);
  assert.ok(b.flags.includes("nostamp"));
  const ok = buildRows(all, res, shifts, [{ rid: "RA", date: "2026-11-11", start: "07:00", end: "16:30", breakMin: 45, by: "Ägare", at: 1 }], "2026-11-09", "2026-11-15", rule, true).find((r) => r.rid === "RA")!;
  assert.equal(ok.paidMin, 9 * 60 + 30 - 45);
});

test("öppen stämpling och stämpling utan jobb", () => {
  const shifts = [{ id: "S2", rid: "RB", name: "Sara", date: "2026-11-12", in: ts("2026-11-12", "09:00"), log: [] }] as never[];
  const r = buildRows([], res, shifts, [], "2026-11-09", "2026-11-15", rule, true)[0];
  assert.ok(r.flags.includes("open") && r.flags.includes("nojob"));
  assert.equal(r.paidMin, 0);
});
