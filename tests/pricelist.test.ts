import { test } from "node:test";
import assert from "node:assert/strict";
import { computePrice, PriceError } from "../lib/pricing/pricelist.js";
import P from "../lib/pricing/prices.json" with { type: "json" };

test("owner's example: 30 m² Kungsör → Malmö 600 km = 2 800 + 7 200 = 10 000 kr", () => {
  const q = computePrice({ service: "move", areaM2: 30, distanceKm: 600, pkg: "bas" }, P);
  assert.equal(q.totalAfterRut, 10000);
});

test("under 15 km no distance fee; 20 km pays all 20 km", () => {
  assert.equal(computePrice({ service: "move", areaM2: 60, distanceKm: 14.4 }, P).totalAfterRut, 3950);
  assert.equal(computePrice({ service: "move", areaM2: 60, distanceKm: 20 }, P).totalAfterRut, 3950 + 240);
});

test("area rounds up to next step: 220 → 13 100, 221 → 14 700, 120 = 3 bilar", () => {
  assert.equal(computePrice({ service: "move", areaM2: 220 }, P).totalAfterRut, 13100);
  assert.equal(computePrice({ service: "move", areaM2: 221 }, P).totalAfterRut, 14700);
  assert.equal(computePrice({ service: "move", areaM2: 120 }, P).cars, 3);
  assert.equal(computePrice({ service: "move", areaM2: 35 }, P).totalAfterRut, 3000);
});

test("over 240 m² move / over 300 m² cleaning → quote on request", () => {
  assert.equal(computePrice({ service: "move", areaM2: 241 }, P).totalAfterRut, null);
  assert.equal(computePrice({ service: "cleaning", areaM2: 301 }, P).totalAfterRut, null);
  assert.equal(computePrice({ service: "cleaning", areaM2: 300 }, P).totalAfterRut, 9200);
});

test("Premium: 10 % off moving + cleaning + km (owner: 1000 + 2000 → 2700 pattern)", () => {
  const q = computePrice({ service: "move", areaM2: 60, distanceKm: 20, pkg: "premium" }, P);
  assert.equal(q.totalAfterRut, Math.round((3950 + 3100 + 240) * 0.9));
});

test("Deluxe: 20 % off moving + cleaning + km, hours added without discount, min 3 h", () => {
  const q = computePrice({ service: "move", areaM2: 60, pkg: "deluxe", crew: 2, hours: 1 }, P);
  assert.equal(q.totalAfterRut, Math.round((3950 + 3100) * 0.8) + 3 * 595);
  const q4 = computePrice({ service: "move", areaM2: 60, pkg: "deluxe", crew: 3, hours: 4 }, P);
  assert.equal(q4.totalAfterRut, Math.round((3950 + 3100) * 0.8) + 4 * 849);
});

test("hourly: min 3 h, started hour counts, no km fee", () => {
  assert.equal(computePrice({ service: "hourly", crew: 2, hours: 2 }, P).totalAfterRut, 3 * 595);
  assert.equal(computePrice({ service: "hourly", crew: 4, hours: 3.2, distanceKm: 500 } as any, P).totalAfterRut, 4 * 1199);
});

test("boxes are added without discount", () => {
  const q = computePrice({ service: "move", areaM2: 30, pkg: "premium", boxes: "rent" }, P);
  assert.equal(q.totalAfterRut, Math.round((2800 + 2000) * 0.9) + 750);
});

test("bad input is rejected", () => {
  assert.throws(() => computePrice({ service: "x" } as any, P), PriceError);
  assert.throws(() => computePrice({ service: "move", areaM2: -5 }, P), PriceError);
  assert.throws(() => computePrice({ service: "hourly", crew: 7 } as any, P), PriceError);
});

test("volume: 60 m² with 25 m³ needs 2 trucks -> cheapest 2-truck price (4700)", () => {
  const r = computePrice({ service: "move", areaM2: 60, distanceKm: 0, pkg: "bas", volumeM3: 25 }, P as any);
  assert.equal(r.totalAfterRut, 4700); assert.equal(r.cars, 2);
});
test("volume within the area's trucks keeps the area price", () => {
  const r = computePrice({ service: "move", areaM2: 60, distanceKm: 0, pkg: "bas", volumeM3: 18 }, P as any);
  assert.equal(r.totalAfterRut, 3950); assert.equal(r.cars, 1);
});
test("volume never lowers the price (big area, small volume)", () => {
  const r = computePrice({ service: "move", areaM2: 120, distanceKm: 0, pkg: "bas", volumeM3: 10 }, P as any);
  assert.equal(r.totalAfterRut, 7500);
});
test("volume over 4 trucks -> quote", () => {
  const r = computePrice({ service: "move", areaM2: 60, pkg: "bas", volumeM3: 85 }, P as any);
  assert.equal(r.totalAfterRut, null); assert.ok(r.onRequest);
});
test("volume + Premium discount applies to the truck price", () => {
  const r = computePrice({ service: "move", areaM2: 60, distanceKm: 0, pkg: "premium", volumeM3: 25 }, P as any);
  assert.equal(r.totalAfterRut, Math.round((4700 + 3100) * 0.9));
});

test("Bas + flyttstäd som tillval läggs till utan rabatt", () => {
  const q = computePrice({ service: "move", pkg: "bas", areaM2: 60, distanceKm: 10, extraCleaning: true }, P);
  assert.equal(q.totalAfterRut, 3950 + 3100);
  const p = computePrice({ service: "move", pkg: "premium", areaM2: 60, distanceKm: 10, extraCleaning: true }, P);
  assert.equal(p.totalAfterRut, 6345);
});

import { validatePrices } from "../lib/pricing/current.ts";
import { systemPrompt } from "../lib/assistant/facts.ts";
test("prislista från admin: kontroller, och chatten använder nya priser", () => {
  const ok = { moveFixed: P.moveFixed, cleaning: P.cleaning, hourly: { ...P.hourly, "2": 650 }, km: P.km, boxes: P.boxes };
  const v = validatePrices(ok as never);
  assert.equal(v.hourly["2"], 650); assert.deepEqual(v.packages, P.packages);
  assert.equal(computePrice({ service: "hourly", crew: 2, hours: 3 }, v).totalAfterRut, 3 * 650);
  assert.throws(() => validatePrices({ ...ok, moveFixed: [[30, 2800, 1], [30, 3000, 1]] } as never), /m² måste öka/);
  assert.throws(() => validatePrices({ ...ok, moveFixed: [[30, 2800, 2], [40, 3000, 1]] } as never), /bilar kan inte minska/);
  assert.throws(() => validatePrices({ ...ok, hourly: { ...P.hourly, "3": -1 } } as never), /3 personer/);
  assert.throws(() => validatePrices({ ...ok, cleaning: [] } as never), /1–40 rader/);
  assert.throws(() => validatePrices({ ...ok, km: { pricePerKm: "x", freeBelowKm: 15 } } as never), /Pris per km/);
  const s = systemPrompt(v);
  assert.match(s, /2 personer \+ 1 bil 650 kr\/tim/);
  assert.doesNotMatch(s, /595 kr\/tim/);
  assert.match(systemPrompt(), /2 personer \+ 1 bil 595 kr\/tim/);
});
