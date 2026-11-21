import { test } from "node:test";
import assert from "node:assert/strict";

const S = new Map<string, string>(), Z = new Map<string, Map<string, number>>();
function run(c: string[]): unknown {
  const [cmd, ...a] = c;
  switch (cmd) {
    case "SET": S.set(a[0], a[1]); return "OK";
    case "GET": return S.get(a[0]) ?? null;
    case "ZREM": { Z.get(a[0])?.delete(a[1]); return 1; }
    case "ZADD": { const m = Z.get(a[0]) ?? new Map(); m.set(a[2], Number(a[1])); Z.set(a[0], m); return 1; }
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t"; process.env.ANTHROPIC_API_KEY = "test-key";
let sent: any = null;
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const u = String(url);
  if (u.startsWith("https://kv.test")) {
    const body = JSON.parse(String(init.body));
    return new Response(JSON.stringify(u.endsWith("/pipeline") ? body.map((x: string[]) => ({ result: run(x) })) : { result: run(body) }));
  }
  if (u.startsWith("https://img.test/")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]), { headers: { "content-type": "image/jpeg" } });
  if (u === "https://api.anthropic.com/v1/messages") {
    sent = JSON.parse(String(init.body));
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify({ m3: 27.6, m3Low: 22, m3High: 33.4, rooms: "Vardagsrum, kök", heavy: ["Piano"], fragile: ["TV"], packing: "Ca 30 kartonger", notes: "Smal trappa.", confidence: "medel" }) }] }));
  }
  throw new Error("unexpected fetch " + u);
}) as typeof fetch;

const store = await import("../lib/booking/store.ts");
const cp = await import("../lib/booking/custphotos.ts");
const ai = await import("../lib/agents/photos.ts");

test("kundens bilder: länk, uppladdning och AI-uppskattning", async () => {
  const b = await store.createBooking("web", { name: "Anna Bild", phone: "0700000000", areaM2: "60", size: "Bara flytt – Bas" });
  const url = await cp.photoLink(b); await store.saveBooking(b);
  assert.match(url, /\/bilder\?t=[A-Za-z0-9_-]{24}$/);
  assert.equal(await cp.photoLink(b), url);                                      // same link again
  const t = url.split("t=")[1];
  assert.equal((await cp.bookingByPhotoToken(t))!.id, b.id);
  assert.equal(await cp.bookingByPhotoToken("x".repeat(24)), null);
  await cp.addCustPhoto(b, "https://img.test/1.jpg"); await cp.addCustPhoto(b, "https://img.test/2.jpg");
  const r = await ai.analyzePhotos(b);
  assert.equal(r!.m3, 28); assert.equal(r!.n, 2); assert.deepEqual(r!.heavy, ["Piano"]);
  const content = sent.messages[0].content;
  assert.equal(content.filter((c: any) => c.type === "image").length, 2);           // photos sent as images, before the text
  assert.equal(content[content.length - 1].type, "text");
  assert.match(content[content.length - 1].text, /Boyta: 60 m²/);
  assert.equal(sent.model, "claude-opus-5-5");
  assert.equal(sent.output_config.format.type, "json_schema");
  for (let i = 0; i < 13; i++) await cp.addCustPhoto(b, `https://img.test/x${i}.jpg`);
  await assert.rejects(cp.addCustPhoto(b, "https://img.test/16.jpg"), /Högst 15/);
});
