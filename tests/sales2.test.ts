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
    case "LPUSH": case "LTRIM": case "LRANGE": return cmd === "LRANGE" ? [] : 1;
    case "ZADD": { const m = Z.get(a[0]) ?? new Map(); m.set(a[2], Number(a[1])); Z.set(a[0], m); return 1; }
    case "ZREM": Z.get(a[0])?.delete(a[1]); return 1;
    case "ZREMRANGEBYSCORE": return 0;
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

const store = await import("../lib/booking/store.ts");
const merge = await import("../lib/booking/merge.ts");
const sla = await import("../lib/booking/sla.ts");

test("dubbletter: samma kund, sammanslagning tar det bästa från båda", async () => {
  const a = await store.createBooking("web", { name: "Moa Berggren", phone: "070-111 22 33", email: "", from: "Mantorp", message: "Har piano" });
  const b = await store.createBooking("web", { name: "Moa Berggren", phone: "+46701112233", email: "moa@ex.se", to: "Linköping", areaM2: "70", message: "Vill ha städ" });
  assert.ok(merge.sameCustomer(a, b));
  a.createdAt = 1000; b.createdAt = 500; b.calls = [{ at: 600, by: "Ägare", outcome: "noanswer", note: "" }];
  merge.mergeInto(a, b);
  assert.equal(a.data.email, "moa@ex.se"); assert.equal(a.data.to, "Linköping"); assert.equal(a.data.from, "Mantorp"); assert.equal(a.data.areaM2, "70");
  assert.match(a.data.message!, /piano[\s\S]*städ/);
  assert.equal(a.createdAt, 500); assert.equal(a.calls!.length, 1);
  assert.ok(a.history.some((h) => h.what.startsWith(`[${b.id}]`)));
  b.status = "signed"; b.signedAt = 1;
  assert.throws(() => merge.mergeInto(a, b), /signerad/);
});

test("lead-svarstid: varnar en gång efter gränsen", async () => {
  S.set("fx:settings", JSON.stringify({ slaMin: 10 }));
  const old = await store.createBooking("web", { name: "Sen Kund", phone: "0700000001" });
  old.createdAt = Date.now() - 15 * 60_000; await store.saveBooking(old);
  const fresh = await store.createBooking("web", { name: "Ny Kund", phone: "0700000002" });
  const answered = await store.createBooking("web", { name: "Svarad", phone: "0700000003" });
  answered.createdAt = Date.now() - 30 * 60_000; answered.firstResponseAt = Date.now(); await store.saveBooking(answered);
  assert.equal(await sla.slaCheck(true), 1);
  assert.ok((await store.getBooking(old.id))!.slaAlertedAt);
  assert.equal(await sla.slaCheck(true), 0);                 // only once
  assert.equal((await store.getBooking(fresh.id))!.slaAlertedAt, undefined);
  assert.equal(await sla.slaCheck(false), 0);                // throttled: at most once a minute
});
