import { test } from "node:test";
import assert from "node:assert/strict";

const S = new Map<string, string>(), Z = new Map<string, Map<string, number>>();
function run(c: string[]): unknown {
  const [cmd, ...a] = c;
  switch (cmd) {
    case "SET": if (a.includes("NX") && S.has(a[0])) return null; S.set(a[0], a[1]); return "OK";
    case "GET": return S.get(a[0]) ?? null;
    case "MGET": return a.map((k) => S.get(k) ?? null);
    case "DEL": S.delete(a[0]); return 1;
    case "ZADD": { const m = Z.get(a[0]) ?? new Map(); m.set(a[2], Number(a[1])); Z.set(a[0], m); return 1; }
    case "ZREVRANGE": return [...(Z.get(a[0]) ?? new Map()).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]);
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const out = String(url).endsWith("/pipeline") ? body.map((x: string[]) => ({ result: run(x) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

const abs = await import("../lib/booking/absence.ts");
const msgs = await import("../lib/booking/messages.ts");
const oc = await import("../lib/booking/opencall.ts");
const store = await import("../lib/booking/store.ts");
const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const A = { id: "RAAAAAAAA", name: "Ahmad" }, B = { id: "RBBBBBBBB", name: "Sara" }, C = { id: "RCCCCCCCC", name: "Omar" };
const person = (p: { id: string; name: string }, app = true) => ({ ...p, kind: "person", color: "#000000", active: true, createdAt: 0, ...(app ? { pinHash: "x" } : {}) }) as never;

test("frånvaro: sjuk gäller direkt, semester väntar på beslut, återkalla", async () => {
  const sick = await abs.addAbsence(A, { kind: "sick" }, "Ahmad");
  assert.deepEqual([sick.status, sick.from, sick.to], ["approved", day(0), day(0)]);
  const vac = await abs.addAbsence(B, { kind: "vacation", from: day(10), to: day(14), note: "Resa" }, "Sara");
  assert.equal(vac.status, "pending");
  await assert.rejects(abs.addAbsence(B, { kind: "vacation", from: day(5), to: day(3) }, "Sara"), /före/);
  await assert.rejects(abs.addAbsence(B, { kind: "x" }, "Sara"), /typ/);
  await assert.rejects(abs.addAbsence(B, { kind: "off", from: day(-5) }, "Sara"), /passerat/);
  assert.equal((await abs.addAbsence(B, { kind: "off", from: day(-5) }, "Kontoret", true)).status, "approved");   // office may register past days
  const all = await abs.listAbsences();
  assert.equal(abs.activeOn(all, B.id, day(12)).length, 1);
  assert.equal((await abs.decide(vac.id, false, "Ägaren")).status, "rejected");
  assert.equal(abs.activeOn(await abs.listAbsences(), B.id, day(12)).length, 0);
  await assert.rejects(abs.withdraw(sick.id, B.id), /Finns inte/);              // not someone else's
  await abs.withdraw(sick.id, A.id);
  assert.equal((await abs.listAbsences()).some((x) => x.id === sick.id), false);
});

test("meddelanden: till alla eller utvalda, lästa per person", async () => {
  await assert.rejects(msgs.postMsg(" ", "all", "Ägaren"), /Skriv/);
  await assert.rejects(msgs.postMsg("Hej", [], "Ägaren"), /Välj/);
  const m1 = await msgs.postMsg("Personalmöte fredag 16:00", "all", "Ägaren");
  const m2 = await msgs.postMsg("Ta med nycklarna", [A.id], "Ägaren");
  const l = await msgs.listMsgs();
  assert.equal(l.filter((m) => msgs.isFor(m, B.id)).length, 1);
  assert.equal(l.filter((m) => msgs.isFor(m, A.id)).length, 2);
  assert.equal(await msgs.markRead([m1.id, m2.id], B.id), 1);                    // B can only read m1
  assert.ok((await msgs.listMsgs()).find((m) => m.id === m1.id)!.read[B.id]);
});

test("vem kan jobba: bara lediga får frågan, först till kvarn, fullt stänger", async () => {
  S.delete("fx:abs");
  const res = [person(A), person(B), person(C), person({ id: "RDDDDDDDD", name: "Utan app" }, false)];
  const job = await store.createBooking("admin", { name: "Kund", phone: "1", date: day(3) });
  Object.assign(job, { status: "signed", time: "08:00", durationH: 4, crew: [A.id] }); await store.saveBooking(job);
  const other = await store.createBooking("admin", { name: "Annan", phone: "2", date: day(3) });
  Object.assign(other, { status: "signed", time: "10:00", durationH: 3, crew: [C.id] }); await store.saveBooking(other);   // C is busy
  const all = () => store.listBookings();
  const people = oc.eligible(job, await all(), res, []);
  assert.deepEqual(people.map((r: { name: string }) => r.name), ["Sara"]);       // not A (on it), not C (busy), not without app
  await abs.addAbsence(B, { kind: "off", from: day(3) }, "Sara");
  assert.equal(oc.eligible(job, await all(), res, await abs.listAbsences()).length, 0);   // B now unavailable
  S.delete("fx:abs");
  await oc.ask(job, 1, "Behöver en till", "Ägaren", await all(), res, []);
  const r = await oc.answer(job.id, res[1], true, res, all, []);
  assert.deepEqual([r.took, r.full], [true, true]);
  const after = (await store.getBooking(job.id))!;
  assert.ok(after.crew!.includes(B.id) && after.openCall!.closedAt);
  await assert.rejects(oc.answer(job.id, res[1], true, res, all, []), /redan tillsatt/);
  await assert.rejects(oc.ask(Object.assign(after, { status: "sent" }), 1, "", "x", await all(), res, []), /Bara bokade/);
});
