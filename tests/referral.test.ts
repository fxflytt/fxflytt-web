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
const store = await import("../lib/booking/store.ts");
const ref = await import("../lib/booking/referral.ts");
const S0 = { refOn: true, refFriendKr: 300, refReward: "300 kr" } as never;

test("tipsa en vän: kod, rabatt, inga egna koder, belöning vid signering", async () => {
  const anna = await store.createBooking("web", { name: "Anna Ödman", phone: "070-111 11 11", email: "anna@ex.se" });
  const code = await ref.issueCode(anna);
  assert.match(code, /^ANNA-[A-Z2-9]{4}$/);
  assert.equal(await ref.issueCode(anna), code);              // same code again
  await store.saveBooking(anna, "kod");

  const self = await store.createBooking("web", { name: "Anna", phone: "+46701111111", price: { total: 5000, lines: [{ label: "Flytt", amount: 5000 }] } } as never);
  await assert.rejects(ref.applyCode(self, code.toLowerCase(), S0), /vänner/);
  await assert.rejects(ref.applyCode(self, "NOPE-1234", S0), /finns inte/);
  await assert.rejects(ref.applyCode(self, code, { ...(S0 as object), refOn: false } as never), /inte just nu/);

  const bo = await store.createBooking("web", { name: "Bo", phone: "070-222", price: { total: 5000, lines: [{ label: "Flytt", amount: 5000 }] } } as never);
  const msg = await ref.applyCode(bo, " " + code.toLowerCase() + " ", S0);
  assert.match(msg, /Anna Ödman/);
  assert.equal(bo.offer!.total, 4700);
  assert.equal(bo.referral!.fromId, anna.id);
  await assert.rejects(ref.applyCode(bo, code, S0), /redan/);

  // a later % discount keeps the friend's code line
  store.applyDiscount(bo, 10);
  assert.ok(bo.offer!.lines.some((l) => l.label.startsWith("Rabattkod")));

  const from = await ref.rewardOnSign(bo);
  assert.equal(from!.refRewards!.length, 1);
  assert.equal(await ref.rewardOnSign(bo), null);            // only once
  const a2 = (await store.getBooking(anna.id))!;
  await ref.markGiven(a2, bo.id, "Ägare");
  assert.ok((await store.getBooking(anna.id))!.refRewards![0].givenAt);
  await assert.rejects(ref.markGiven(a2, bo.id, "Ägare"), /ingen belöning/);
});
