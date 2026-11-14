import { test } from "node:test";
import assert from "node:assert/strict";

// In-memory Upstash with strings, sorted sets and lists (only what the backup uses).
const S = new Map<string, string>(), Z = new Map<string, Map<string, number>>(), L = new Map<string, string[]>();
function run(c: string[]): unknown {
  const [cmd, ...a] = c;
  switch (cmd) {
    case "SET": S.set(a[0], a[1]); return "OK";
    case "GET": return S.get(a[0]) ?? null;
    case "MGET": return a.map((k) => S.get(k) ?? null);
    case "DEL": S.delete(a[0]); Z.delete(a[0]); L.delete(a[0]); return 1;
    case "EXISTS": return S.has(a[0]) || Z.has(a[0]) || L.has(a[0]) ? 1 : 0;
    case "TYPE": return S.has(a[0]) ? "string" : Z.has(a[0]) ? "zset" : L.has(a[0]) ? "list" : "none";
    case "SCAN": return ["0", [...S.keys(), ...Z.keys(), ...L.keys()].filter((k) => k.startsWith("fx:"))];
    case "ZADD": { const m = Z.get(a[0]) ?? new Map(); const nx = a[1] === "NX"; const r = a.slice(nx ? 2 : 1);
      for (let i = 0; i < r.length; i += 2) if (!(nx && m.has(r[i + 1]))) m.set(r[i + 1], Number(r[i])); Z.set(a[0], m); return 1; }
    case "ZRANGE": return [...(Z.get(a[0]) ?? new Map()).entries()].sort((x, y) => x[1] - y[1]).flatMap(([m, s]) => [m, String(s)]);
    case "ZREVRANGE": { const l = [...(Z.get(a[0]) ?? new Map()).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]); const e = Number(a[2]); return l.slice(Number(a[1]), e < 0 ? l.length + e + 1 : e + 1); }
    case "RPUSH": { const l = L.get(a[0]) ?? []; l.push(...a.slice(1)); L.set(a[0], l); return l.length; }
    case "LRANGE": return L.get(a[0]) ?? [];
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t"; process.env.ADMIN_PASSWORD = "ägare-123";
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const out = String(url).endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

const store = await import("../lib/booking/store.ts");
const bk = await import("../lib/booking/backup.ts");

test("säkerhetskopia: allt med, återställ bara det som saknas, krypterad fil", async () => {
  const a = await store.createBooking("web", { name: "Anna", phone: "070-1", email: "anna@example.se" });
  const b = await store.createBooking("web", { name: "Bo", phone: "070-2" });
  S.set("fx:res", JSON.stringify([{ id: "RA", name: "Ahmad" }]));
  L.set("fx:wp:" + a.id, [JSON.stringify({ url: "u1", kind: "before", at: 1 })]);
  S.set("fx:ph:abc", "big photo data");
  const d = await bk.dump();
  assert.ok(d.keys["fx:b:" + a.id] && d.keys["fx:idx"] && d.keys["fx:wp:" + a.id] && d.keys["fx:res"]);
  assert.equal("fx:ph:abc" in d.keys, false);                       // temporary photo data is not backed up

  // disaster: Bo's booking and the photo list are deleted, Anna is changed after the backup
  S.delete("fx:b:" + b.id); Z.get("fx:idx")!.delete(b.id); L.delete("fx:wp:" + a.id);
  const changed = { ...(await store.getBooking(a.id))!, adminNote: "ändrad efter kopian" }; S.set("fx:b:" + a.id, JSON.stringify(changed));

  const enc = bk.encrypt(bk.pack(d));
  assert.equal(enc.subarray(0, 4).toString(), "FXB1");
  assert.equal(enc.includes(Buffer.from("anna@example.se")), false);   // nothing readable in the stored copy
  const r = await bk.restoreMissing(bk.unpack(enc));
  assert.equal(r.bookings, 1);
  assert.equal((await store.getBooking(b.id))?.data.name, "Bo");
  assert.equal((await store.listBookings()).length, 2);
  assert.equal((await store.getBooking(a.id))?.adminNote, "ändrad efter kopian");  // existing data untouched
  assert.equal(L.get("fx:wp:" + a.id)?.length, 1);
  assert.deepEqual(await bk.restoreMissing(d), { keys: 0, bookings: 0, index: 0 });   // second time: nothing to do

  assert.equal(bk.unpack(bk.pack(d)).keys["fx:res"].v, d.keys["fx:res"].v);  // plain .json.gz download reads back
  process.env.ADMIN_PASSWORD = "nytt-lösen";
  assert.throws(() => bk.unpack(enc), /annat ägarlösenord/);
  assert.throws(() => bk.unpack(Buffer.from("hej")), /inte en säkerhetskopia/);
  await assert.rejects(bk.restoreMissing({ format: "x" } as never), /inte en säkerhetskopia/);
  const csv = bk.bookingsCsv(d);
  assert.ok(csv.startsWith("﻿")); assert.match(csv, /"Anna";"070-1";"anna@example.se"/);
});
