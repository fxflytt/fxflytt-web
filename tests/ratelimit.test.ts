import { test } from "node:test";
import assert from "node:assert/strict";

// Upstash stand-in: INCR/EXPIRE only. `down` makes every call fail, like an outage.
const db = new Map<string, number>(); const ttl = new Map<string, number>(); let down = false; let calls = 0;
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  calls++;
  if (down) return new Response("down", { status: 500 });
  const [cmd, k, v] = JSON.parse(String(init.body)) as [string, string, number];
  let result: unknown = "OK";
  if (cmd === "INCR") { result = (db.get(k) ?? 0) + 1; db.set(k, result as number); }
  if (cmd === "EXPIRE") ttl.set(k, Number(v));
  return new Response(JSON.stringify({ result }), { status: 200 });
}) as typeof fetch;

const { rateLimited } = await import("../lib/rateLimit.ts");

test("delad räknare: inloggning spärras efter 8 försök (gäller alla serverinstanser)", async () => {
  const res = [];
  for (let i = 0; i < 9; i++) res.push(await rateLimited("login:9.9.9.9", 8, 15 * 60_000));
  assert.deepEqual(res, [false, false, false, false, false, false, false, false, true]);
  assert.ok(calls > 0, "räknaren ligger i Upstash");
  const [key] = [...ttl.keys()];
  assert.match(key, /^rl2:login:9\.9\.9\.9:\d+$/);
  assert.equal(ttl.get(key), 15 * 60 + 5, "nyckeln försvinner av sig själv när fönstret är slut");
});

test("olika IP-adresser räknas var för sig", async () => {
  assert.equal(await rateLimited("chat-min:1.1.1.1", 1, 60_000), false);
  assert.equal(await rateLimited("chat-min:2.2.2.2", 1, 60_000), false);
  assert.equal(await rateLimited("chat-min:1.1.1.1", 1, 60_000), true);
});

test("Upstash nere: skyddet fortsätter i minnet", async () => {
  down = true;
  const res = [];
  for (let i = 0; i < 3; i++) res.push(await rateLimited("crewlogin:3.3.3.3", 2, 60_000));
  assert.deepEqual(res, [false, false, true]);
  down = false;
});
