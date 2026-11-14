import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// In-memory stand-in for Upstash (GET/SET only – the team list is one key).
const db = new Map<string, string>();
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const [cmd, k, v] = JSON.parse(String(init.body));
  const result = cmd === "SET" ? (db.set(k, v), "OK") : cmd === "GET" ? db.get(k) ?? null : null;
  return new Response(JSON.stringify({ result }), { status: 200 });
}) as typeof fetch;

const { schedule } = await import("../lib/booking/schedule.ts");
const team = await import("../lib/booking/team.ts");
beforeEach(() => db.clear());

const R = [
  { id: "RA", kind: "person", name: "Ahmad", color: "#000000", active: true, createdAt: 0 },
  { id: "RB", kind: "person", name: "Sara", color: "#000000", active: true, createdAt: 0 },
  { id: "RT", kind: "vehicle", name: "Lastbil 1", color: "#000000", active: true, createdAt: 0 },
] as any[];
const job = (id: string, o: any) => ({ id, status: "signed", data: { name: "Kund " + id }, ...o });

test("beräknad tid: timmar i prisraderna, annars boyta + körtid", () => {
  assert.equal(schedule.estimateHours({ offer: { total: 0, lines: [{ label: "2 flyttare + bil, 4 tim × 595 kr", amount: 2380 }] } } as any), 4);
  assert.equal(schedule.estimateHours({ data: { areaM2: "50" } } as any), 4);             // 2 + 50/25
  assert.equal(schedule.estimateHours({ data: { areaM2: "60", distanceKm: 350 } } as any), 9.5); // 4.4 + 5 → 9.5
  assert.equal(schedule.estimateHours({ data: { areaM2: "80", size: "Bara flyttstäd" } } as any), 4);
  assert.equal(schedule.estimateHours({ data: {} } as any), 4);
  assert.equal(schedule.hoursOf({ durationH: 6.5, data: { areaM2: "50" } } as any), 6.5);
});

test("krock: samma person på överlappande jobb samma dag", () => {
  const a = job("A", { date: "2026-12-05", time: "08:00", durationH: 4, crew: ["RA", "RT"] });
  const b = job("B", { date: "2026-12-05", time: "11:00", durationH: 3, crew: ["RA", "RB"] });
  const c = job("C", { date: "2026-12-05", time: "12:00", durationH: 3, crew: ["RT"] });  // börjar när A slutar
  const all = [a, b, c];
  const cs = schedule.conflicts(b, all, R);
  assert.deepEqual(cs.map((x) => [x.resourceId, x.bookingId, x.from, x.to]), [["RA", "A", "08:00", "12:00"]]);
  assert.equal(schedule.conflicts(c, all, R).length, 0);
});

test("krock: jobb utan starttid blockerar hela dagen, avbokade blockerar inte", () => {
  const a = job("A", { date: "2026-12-05", crew: ["RB"] });
  const b = job("B", { date: "2026-12-05", time: "16:00", durationH: 2, crew: ["RB"] });
  assert.equal(schedule.conflicts(b, [a, b], R)[0].from, "hela dagen");
  assert.equal(schedule.conflicts(b, [{ ...a, status: "cancelled" }, b], R).length, 0);
  assert.equal(schedule.conflicts(b, [{ ...a, date: "2026-12-06" }, b], R).length, 0);
  assert.equal(schedule.conflicts({ ...b, crew: [] }, [a, b], R).length, 0);
});

test("personal och fordon: lägg till, ändra, arkivera; färger delas ut", async () => {
  const c = team.cleanResource({ kind: "person", name: "  Ahmad  ", phone: "070-111 22 33", role: "Flyttledare" });
  assert.ok("ok" in c);
  const a = await team.addResource((c as any).ok);
  const t = await team.addResource({ kind: "vehicle", name: "Lastbil 1" });
  assert.match(a.id, /^R[0-9A-F]{8}$/); assert.equal(a.name, "Ahmad"); assert.notEqual(a.color, t.color);
  assert.deepEqual("error" in team.cleanResource({ kind: "boss", name: "x" }), true);
  assert.deepEqual("error" in team.cleanResource({ kind: "person", name: " " }), true);
  await team.updateResource(a.id, { active: false, id: "hack" } as any);
  const list = await team.listResources();
  assert.equal(list.length, 2); assert.equal(list[0].id, a.id); assert.equal(list[0].active, false);
  assert.equal(await team.updateResource("nope", { name: "x" }), null);
});
