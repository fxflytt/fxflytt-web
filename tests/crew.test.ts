import { test } from "node:test";
import assert from "node:assert/strict";

const S = new Map<string, string>();
function run(c: string[]): unknown {
  const [cmd, a0, a1] = c;
  switch (cmd) {
    case "SET": S.set(a0, a1); return "OK";
    case "GET": return S.get(a0) ?? null;
    case "DEL": S.delete(a0); return 1;
    case "INCR": { const v = Number(S.get(a0) || 0) + 1; S.set(a0, String(v)); return v; }
    case "EXPIRE": return 1;
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t"; process.env.ADMIN_PASSWORD = "ägare-123";
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const out = String(url).endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

const team = await import("../lib/booking/team.ts");
const crew = await import("../lib/booking/crew.ts");
const req = (cookie: string) => new Request("https://x/", { headers: { cookie: cookie.split(";")[0] } });

test("personalappen: kod, inloggning, spärr, utloggning vid ny kod/avstängd/arkiverad", async () => {
  const noPhone = await team.addResource({ kind: "person", name: "Utan nummer" });
  await assert.rejects(crew.invite(noPhone.id), /mobilnummer/);
  const car = await team.addResource({ kind: "vehicle", name: "Lastbil" });
  await assert.rejects(crew.invite(car.id), /finns inte/);
  const a = await team.addResource({ kind: "person", name: "Ahmad", phone: "070-111 22 33" });
  const { pin } = await crew.invite(a.id);
  assert.match(pin, /^\d{6}$/);
  const pub = team.publicResource((await team.listResources()).find((r) => r.id === a.id)!) as Record<string, unknown>;
  assert.equal(pub.app, true); assert.equal("pinHash" in pub || "pinSalt" in pub, false);

  assert.ok("error" in await crew.login("0701112233", "000000".replace(/./g, (d, i) => String((Number(pin[i]) + 1) % 10))));
  const ok = await crew.login("+46 70 111 22 33", pin);                        // any way of writing the number
  assert.ok("person" in ok);
  const c1 = crew.crewCookie((ok as { person: team.Resource }).person);
  assert.equal((await crew.crewUser(req(c1)))?.name, "Ahmad");
  assert.equal(await crew.crewUser(req(c1.replace(/\.[^.;]+;/, ".AAAA;"))), null);   // forged signature

  const { pin: pin2 } = await crew.invite(a.id);                               // new PIN → old phone logged out
  assert.equal(await crew.crewUser(req(c1)), null);
  assert.ok("error" in await crew.login("0701112233", pin === pin2 ? "x" : pin));
  const c2 = crew.crewCookie(((await crew.login("0701112233", pin2)) as { person: team.Resource }).person);
  await crew.disable(a.id);
  assert.equal(await crew.crewUser(req(c2)), null);

  const b = await team.addResource({ kind: "person", name: "Sara", phone: "073-555 66 77" });
  const { pin: pb } = await crew.invite(b.id);
  const c3 = crew.crewCookie(((await crew.login("0735556677", pb)) as { person: team.Resource }).person);
  await team.updateResource(b.id, { active: false });
  assert.equal(await crew.crewUser(req(c3)), null);                            // archived

  // 8 wrong PINs lock the number, even for the right PIN
  const c = await team.addResource({ kind: "person", name: "Lina", phone: "076-000 11 22" });
  const { pin: pc } = await crew.invite(c.id);
  for (let i = 0; i < 8; i++) await crew.login("0760001122", "999999" === pc ? "888888" : "999999");
  const locked = await crew.login("0760001122", pc);
  assert.ok("error" in locked && /För många/.test(locked.error));
});
