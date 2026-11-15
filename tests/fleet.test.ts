import { test } from "node:test";
import assert from "node:assert/strict";

const S = new Map<string, string>();
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const [cmd, k, v] = JSON.parse(String(init.body));
  const result = cmd === "GET" ? S.get(k) ?? null : (S.set(k, v), "OK");
  return new Response(JSON.stringify({ result }), { status: 200 });
}) as typeof fetch;

const fleet = await import("../lib/booking/fleet.ts");
const dmg = await import("../lib/booking/damage.ts");
const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const V = [{ id: "RV1", name: "Lastbil 1", kind: "vehicle", active: true }, { id: "RV2", name: "Gammal", kind: "vehicle", active: false }];

test("fordon: påminnelser, klart flyttar fram, service per km", async () => {
  await fleet.setVehicle("RV1", { reg: "abc123", km: 50000, serviceEveryKm: 20000, due: { besiktning: day(10), insurance: day(-2), tires: day(90) } });
  await fleet.setVehicle("RV2", { due: { besiktning: day(1) } });
  await assert.rejects(fleet.setVehicle("RV1", { due: { service: "igår" } }), /Fel datum/);
  let due = fleet.dueSoon(await fleet.getFleet(), V, day(0));
  assert.deepEqual(due.map((d) => d.kind), ["insurance", "besiktning"]);   // late first, archived vehicle skipped, tyres 90 d away
  assert.ok(due[0].late);
  await fleet.addLog("RV1", { kind: "besiktning", kr: "650", date: day(0) }, "Ägare");
  const f = await fleet.getFleet();
  assert.equal(f.v.RV1.due.besiktning, fleet.addMonths(day(0), 12));
  assert.equal(f.v.RV1.reg, "ABC123");
  await fleet.addLog("RV1", { kind: "service", kr: 3000, km: 51000 }, "Ägare");
  assert.equal((await fleet.getFleet()).v.RV1.serviceKm, 71000);
  await fleet.setVehicle("RV1", { serviceKm: 52000 });
  due = fleet.dueSoon(await fleet.getFleet(), V, day(0));
  assert.ok(due.some((d) => d.kind === "service" && d.kmLeft === 1000));
});

test("tankning från appen: belopp krävs, mätare får inte gå bakåt, förbrukning", async () => {
  await assert.rejects(fleet.addLog("RV1", { kind: "fuel" }, "Ahmad", "RA"), /beloppet/);
  await assert.rejects(fleet.addLog("RV1", { kind: "fuel", kr: 500, km: 10000 }, "Ahmad", "RA"), /lägre än förra/);
  const e1 = await fleet.addLog("RV1", { kind: "fuel", kr: "1 200", liters: "60,5", km: 52000 }, "Ahmad", "RA");
  assert.equal(e1.kr, 1200); assert.equal(e1.liters, 60.5);
  await fleet.addLog("RV1", { kind: "fuel", kr: 1000, liters: 50, km: 52500 }, "Ahmad", "RA");
  await fleet.setLogPhoto(e1.id, "https://x/k.jpg", "RA");
  await assert.rejects(fleet.setLogPhoto(e1.id, "https://x/k.jpg", "RB"), /Hittar inte/);
  const c = fleet.costs(await fleet.getFleet(), day(-1), day(0)).RV1;
  assert.equal(c.fuelKr, 2200); assert.equal(c.l100, 10);   // 50 l on 500 km
  assert.equal((await fleet.getFleet()).v.RV1.km, 52500);
});

test("skador: rapport, bilder, status och logg", async () => {
  await assert.rejects(dmg.addDamage({ kind: "customer", desc: "x" }, "Ahmad", {}), /Välj vilket jobb/);
  await assert.rejects(dmg.addDamage({ kind: "vehicle", desc: "" }, "Ahmad", { vehicle: { id: "RV1", name: "Lastbil 1" } }), /Beskriv/);
  const d = await dmg.addDamage({ kind: "customer", desc: "Repa på byrån. Kunden såg den." }, "Ahmad", { booking: { id: "FX1", name: "Anna" }, crewId: "RA" });
  assert.equal(d.title, "Repa på byrån"); assert.equal(d.status, "new");
  await dmg.addDamagePhoto(d.id, "https://x/1.jpg", "Ahmad", "RA");
  await assert.rejects(dmg.addDamagePhoto(d.id, "https://x/2.jpg", "Sara", "RB"), /Hittar inte/);
  const u = await dmg.updateDamage(d.id, { status: "closed", cost: "1 500", paidBy: "us", outcome: "Kunden fick 1 500 kr", note: "ringt" }, "Ägare");
  assert.equal(u.cost, 1500); assert.equal(u.photos.length, 1);
  assert.deepEqual(u.log.map((l) => l.what), ["Rapporterad", "Status: Avslutad", "Kostnad 1500 kr", "Vi betalar", "Beslut/lösning uppdaterad", "Anteckning: ringt"]);
  await assert.rejects(dmg.updateDamage(d.id, { status: "x" }, "Ägare"), /Fel status/);
});

test("tomt fält sparas inte som 0", async () => {
  const v = await fleet.setVehicle("RV1", { serviceKm: "", serviceEveryKm: "" });
  assert.equal(v.serviceKm, undefined); assert.equal(v.serviceEveryKm, undefined);
});
