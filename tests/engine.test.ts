import { test } from "node:test";
import assert from "node:assert/strict";
import { computeQuote, ValidationError } from "../lib/pricing/engine.ts";
import { currentConfig, catalog } from "../lib/pricing/config.current.ts";
import type { QuoteInput } from "../lib/pricing/types.ts";

const base = (o: Partial<QuoteInput> = {}): QuoteInput => ({
  kind: "private", propertyType: "apartment", size: "2rok", date: "2026-12-02", // Wednesday
  pickup: { floor: 0, elevator: true, carryDistanceM: 10 },
  delivery: { floor: 2, elevator: true, carryDistanceM: 10 },
  drivingDistanceKm: 0, inventory: [], extras: [], wantsRut: true, ...o,
});

test("hourly prices match the current page: 2 movers 1 195 kr/h, 3 movers 1 695 kr/h before RUT", () => {
  const two = computeQuote(base({ size: "1rok" }), currentConfig, catalog);   // 3 h, 2 movers
  assert.equal(two.hours, 3);
  assert.equal(two.totalBeforeRutSek, 3 * 1195);
  assert.equal(two.totalAfterRutSek, 3 * 695);

  const three = computeQuote(base({ size: "3rok" }), currentConfig, catalog); // 5 h, 3 movers
  assert.equal(three.totalBeforeRutSek, 5 * 1695);
  assert.equal(three.totalAfterRutSek, 5 * 945);
});

test("RUT never applies to the vehicle line", () => {
  const q = computeQuote(base(), currentConfig, catalog);
  const vehicle = q.lines.find((l) => l.code === "vehicle")!;
  assert.equal(vehicle.rutEligible, false);
  assert.equal(q.rutBaseSek, q.lines.find((l) => l.code === "labour")!.amountSek);
});

test("cleaning 50 kr/m² before RUT, 25 kr/m² after (current page)", () => {
  const withC = computeQuote(base({ cleaningM2: 60 }), currentConfig, catalog);
  const without = computeQuote(base(), currentConfig, catalog);
  assert.equal(withC.totalBeforeRutSek - without.totalBeforeRutSek, 3000);
  assert.equal(withC.totalAfterRutSek - without.totalAfterRutSek, 1500);
});

test("business customers get no RUT and a review note if they asked for it", () => {
  const q = computeQuote(base({ kind: "business" }), currentConfig, catalog);
  assert.equal(q.rutDeductionSek, 0);
  assert.equal(q.totalAfterRutSek, q.totalBeforeRutSek);
  assert.ok(q.reviewReasons.some((r) => r.includes("privatpersoner")));
});

test("no elevator adds 1 hour; minimum 3 hours; half-hour rounding", () => {
  const q = computeQuote(base({ size: "2rok", delivery: { floor: 3, elevator: false, carryDistanceM: 0 } }), currentConfig, catalog);
  assert.equal(q.hours, 5.5);
  assert.equal(computeQuote(base({ size: "1rok" }), currentConfig, catalog).hours, 3);
});

test("packing adds 2.5 h for 2 movers and 3 h for 3 movers", () => {
  assert.equal(computeQuote(base({ size: "2rok", extras: ["packing"] }), currentConfig, catalog).hours, 7);
  assert.equal(computeQuote(base({ size: "3rok", extras: ["packing"] }), currentConfig, catalog).hours, 8);
});

test("inventory volume, item count and boxes", () => {
  const q = computeQuote(base({ inventory: [
    { itemId: "sofa3", qty: 1 }, { itemId: "bed2", qty: 1 }, { itemId: "box", qty: 20 },
    { label: "Akvarium", volumeM3: 0.3, qty: 1 },
  ] }), currentConfig, catalog);
  assert.equal(q.volumeM3, 1.8 + 1.5 + 20 * 0.06 + 0.3);
  assert.equal(q.itemCount, 23);
  assert.equal(q.estimatedBoxes, 20);
});

test("missing prices are never invented: distance, weekend and unpriced extras -> requires review", () => {
  const q = computeQuote(base({ drivingDistanceKm: 120, date: "2026-12-05", extras: ["boxes"] }), currentConfig, catalog);
  assert.equal(q.status, "estimate_requires_review");
  const dist = q.lines.find((l) => l.code === "distance")!;
  assert.equal(dist.amountSek, null);
  assert.ok(q.reviewReasons.some((r) => r.includes("milersättning")));
  assert.ok(q.reviewReasons.some((r) => r.includes("Helgdag")));
  assert.ok(q.reviewReasons.some((r) => r.includes("Flyttkartonger")));
});

test("a fully priced quote is a plain estimate", () => {
  assert.equal(computeQuote(base(), currentConfig, catalog).status, "estimate");
});

test("RUT is capped at the annual ceiling", () => {
  const cfg = { ...currentConfig, rutAnnualCapSek: 1000 };
  assert.equal(computeQuote(base(), cfg, catalog).rutDeductionSek, 1000);
});

test("method B (wage uplift, not enabled) uses wage × 2.5 + VAT, never more than the invoiced labour", () => {
  const cfg = { ...currentConfig, rut: { method: "wage_uplift" as const, rate: 0.5, hourlyWageSek: 160, uplift: 2.5, vatRate: 0.25 } };
  const q = computeQuote(base({ size: "1rok" }), cfg, catalog); // 2 movers × 3 h = 6 worked hours
  assert.equal(q.rutBaseSek, Math.round(6 * 160 * 2.5 * 1.25)); // 3 000
  assert.equal(q.rutDeductionSek, 1500);
});

test("method B without a wage falls back to manual review, never guesses", () => {
  const cfg = { ...currentConfig, rut: { method: "wage_uplift" as const, rate: 0.5, hourlyWageSek: null, uplift: 2.5, vatRate: 0.25 } };
  const q = computeQuote(base(), cfg, catalog);
  assert.equal(q.rutDeductionSek, 0);
  assert.equal(q.status, "estimate_requires_review");
});

test("input validation rejects manipulated or broken input", () => {
  assert.throws(() => computeQuote(base({ drivingDistanceKm: -5 }), currentConfig, catalog), ValidationError);
  assert.throws(() => computeQuote(base({ inventory: [{ itemId: "sofa3", qty: 1.5 }] }), currentConfig, catalog), ValidationError);
  assert.throws(() => computeQuote(base({ inventory: [{ itemId: "nope", qty: 1 }] }), currentConfig, catalog), ValidationError);
  assert.throws(() => computeQuote(base({ extras: ["free-move"] }), currentConfig, catalog), ValidationError);
  assert.throws(() => computeQuote(base({ date: "2026-13-40" }), currentConfig, catalog), ValidationError);
  // A client-sent price field is simply not part of the input type and is ignored.
  const tampered = { ...base(), totalAfterRutSek: 1 } as unknown as QuoteInput;
  assert.equal(computeQuote(tampered, currentConfig, catalog).totalAfterRutSek, computeQuote(base(), currentConfig, catalog).totalAfterRutSek);
});

test("FlexFlytt gives 15 % off every line, and RUT is computed on the discounted labour", () => {
  const normal = computeQuote(base(), currentConfig, catalog);
  const flex = computeQuote(base({ flex: true }), currentConfig, catalog);
  assert.equal(flex.totalBeforeRutSek, Math.round(normal.totalBeforeRutSek * 0.85));
  const labour = flex.lines.find((l) => l.code === "labour")!;
  assert.equal(flex.rutBaseSek, labour.amountSek);
  assert.equal(flex.rutDeductionSek, Math.round(labour.amountSek! * 0.5));
});
