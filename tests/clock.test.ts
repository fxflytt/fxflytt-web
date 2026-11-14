import { test } from "node:test";
import assert from "node:assert/strict";

// In-memory Upstash: strings + hashes.
const S = new Map<string, string>(), H = new Map<string, Map<string, string>>();
function run(c: string[]): unknown {
  const [cmd, a, b, v] = c;
  switch (cmd) {
    case "SET": S.set(a, b); return "OK";
    case "GET": return S.get(a) ?? null;
    case "DEL": S.delete(a); return 1;
    case "HSET": { const m = H.get(a) ?? new Map(); m.set(b, v); H.set(a, m); return 1; }
    case "HGET": return H.get(a)?.get(b) ?? null;
    case "HDEL": H.get(a)?.delete(b); return 1;
    case "HGETALL": return [...(H.get(a) ?? new Map()).entries()].flat();
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const out = String(url).endsWith("/pipeline") ? body.map((x: string[]) => ({ result: run(x) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

import type { Loc } from "../lib/booking/clock.ts";
const clock = await import("../lib/booking/clock.ts");
const { DEFAULTS } = await import("../lib/booking/settings.ts");
const { hoursReport } = await import("../lib/booking/report.ts");
const office = { lat: 59.4221, lon: 16.0972, label: "Frejgatan 9B, Kungsör" };
const S0 = { ...DEFAULTS, clockOn: true, office, clockRadiusM: 500 };
const P = { id: "RA", name: "Ahmad" };

test("stämpelklocka: bara nära kontoret, inte två gånger, ägaren rättar", async () => {
  assert.equal(clock.checkPlace({ ...S0, clockOn: false }, { lat: office.lat, lon: office.lon, acc: 10 }).ok, false);
  const near = clock.checkPlace(S0, { lat: 59.4250, lon: 16.0972, acc: 20 });               // ~320 m north
  assert.ok(near.ok && near.loc.dist > 250 && near.loc.dist < 400);
  const far = clock.checkPlace(S0, { lat: 59.3713, lon: 16.5098, acc: 20 });                 // Eskilstuna
  assert.ok(!far.ok && /km från kontoret/.test(far.error));
  assert.equal(clock.checkPlace(S0, { lat: 59.4300, lon: 16.0972, acc: 400 }).ok, false);    // too unsure
  assert.equal(clock.checkPlace(S0, { lat: 59.4268, lon: 16.0972, acc: 50 }).ok, true);      // 520 m but ±50 m
  assert.equal(clock.checkPlace(S0, {}).ok, false);

  const t0 = Date.parse("2026-11-16T06:58:00Z");
  const loc = (near as { loc: Loc }).loc;
  const sh = await clock.clockIn(P, loc, t0);
  assert.equal(sh.date, "2026-11-16");
  await assert.rejects(clock.clockIn(P, loc, t0 + 60_000), /redan instämplad/);
  assert.equal((await clock.openShift("RA"))?.id, sh.id);
  const out = await clock.clockOut(P, loc, t0 + 8.5 * 36e5);
  assert.equal(clock.hoursOf(out), 8.5);
  assert.equal(await clock.openShift("RA"), null);
  await assert.rejects(clock.clockOut(P, loc), /inte instämplad/);

  // forgot to clock in: the owner adds it (Stockholm time), then corrects it – both logged
  const added = await clock.saveShift({ rid: "RA", name: "Ahmad", in: "2026-11-03T07:00", out: "2026-11-03T15:30" }, "Ägaren");
  assert.equal(new Date(added.in).toISOString(), "2026-11-03T06:00:00.000Z");
  const fixed = await clock.saveShift({ id: added.id, month: "2026-11", rid: "RA", name: "Ahmad", in: "2026-11-03T07:00", out: "2026-11-03T16:00" }, "Ägaren");
  assert.equal(clock.hoursOf(fixed), 9); assert.equal(fixed.log.length, 2); assert.match(fixed.log[1].what, /Ändrad/);
  await assert.rejects(clock.saveShift({ rid: "RA", name: "Ahmad", in: "2026-11-04T16:00", out: "2026-11-04T07:00" }, "x"), /efter instämpling/);
  // summer time (UTC+2)
  const summer = await clock.saveShift({ rid: "RA", name: "Ahmad", in: "2026-06-10T07:00", out: "2026-06-10T08:00" }, "x");
  assert.equal(new Date(summer.in).toISOString(), "2026-06-10T05:00:00.000Z");

  const list = await clock.shiftsOf("2026-11");
  assert.equal(list.length, 2);
  const rows = hoursReport([], [{ id: "RA", kind: "person", name: "Ahmad", color: "#000000", active: true, createdAt: 0 }], "2026-11", list);
  assert.deepEqual([rows[0].clockHours, rows[0].days], [17.5, 2]);
  await clock.deleteShift("2026-11", added.id);
  assert.equal((await clock.shiftsOf("2026-11")).length, 1);
});
