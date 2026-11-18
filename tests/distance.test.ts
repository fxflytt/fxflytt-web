import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { findTown, roadKm, quoteRoute } from "../lib/assistant/distance.ts";
import { askClaude, type ChatTool } from "../lib/assistant/chat.ts";
import TOWNS from "../lib/assistant/towns.json" with { type: "json" };

const P = JSON.parse(readFileSync(new URL("../lib/pricing/prices.json", import.meta.url), "utf8"));

test("towns.json is the same list as the address field on the home page", () => {
  const html = readFileSync(new URL("../site-src/index.html", import.meta.url), "utf8");
  const m = /const TOWNS=(\[\[.*?\]\]);/s.exec(html);
  assert.ok(m);
  assert.deepEqual(JSON.parse(m![1]), TOWNS);
});

test("findTown ignores case, å/ä/ö and words like 'centrum'", () => {
  assert.equal(findTown("orebro")?.[0], "Örebro");
  assert.equal(findTown("Örebro centrum")?.[0], "Örebro");
  assert.equal(findTown("KUNGSÖR")?.[0], "Kungsör");
  assert.equal(findTown("Atlantis"), null);
});

test("distance and price match the price calculator (Kungsör–Örebro, 60 m²)", () => {
  assert.equal(roadKm(findTown("Kungsör")!, findTown("Örebro")!), 66);
  const q = quoteRoute({ from: "Kungsör", to: "Örebro", area_m2: 60 }, P) as any;
  assert.equal(q.distance_km, 66);
  assert.equal(q.km_cost_per_truck_kr, 792);
  assert.equal(q.prices.bas.total_after_rut_kr, 4742);
  assert.equal(q.prices.premium.total_after_rut_kr, 7058);
});

test("quoteRoute asks for the floor area and reports unknown towns", () => {
  assert.equal((quoteRoute({ from: "Kungsör", to: "Arboga" }, P) as any).missing?.startsWith("boyta"), true);
  assert.deepEqual((quoteRoute({ from: "Kungsör", to: "Atlantis" }, P) as any).unknown_towns, ["Atlantis"]);
});

test("askClaude runs a tool call and returns the final answer", async () => {
  const calls: any[] = [];
  const fake = (async (_u: string, init: any) => {
    const body = JSON.parse(init.body); calls.push(body);
    if (calls.length === 1) {
      assert.equal(body.tools[0].name, "rakna_flytt");
      return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", id: "t1", name: "rakna_flytt", input: { from: "Kungsör", to: "Örebro", area_m2: 60 } }] }), { status: 200 });
    }
    const result = JSON.parse(body.messages.at(-1).content[0].content);
    assert.equal(result.prices.bas.total_after_rut_kr, 4742);
    return new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Ca 66 km, 4 742 kr efter RUT." }] }), { status: 200 });
  }) as unknown as typeof fetch;
  const tool: ChatTool = { def: { name: "rakna_flytt", description: "x", input_schema: {} }, run: (i) => quoteRoute(i, P) };
  const reply = await askClaude([{ role: "user", content: "Vad kostar 60 m² från Kungsör till Örebro?" }], "k", fake, "sys", [tool]);
  assert.equal(reply, "Ca 66 km, 4 742 kr efter RUT.");
  assert.equal(calls.length, 2);
});
