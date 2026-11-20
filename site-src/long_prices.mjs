// Prices for the page "Flytt mellan städer", from the real price engine.
// Input (argv[2]): JSON list of [km, m2]. Output: [{km, m2, cars, bas, premium, kmCost}] (kr after RUT).
import { computePrice } from "../lib/pricing/pricelist.js";
import { readFileSync } from "node:fs";
const P = JSON.parse(readFileSync(new URL("../lib/pricing/prices.json", import.meta.url)));
const rows = JSON.parse(process.argv[2] || "[]");
console.log(JSON.stringify(rows.map(([km, m2]) => {
  const b = computePrice({ service: "move", areaM2: m2, distanceKm: km, pkg: "bas" }, P);
  const p = computePrice({ service: "move", areaM2: m2, distanceKm: km, pkg: "premium" }, P);
  const kmLine = b.lines.find((l) => l.label.startsWith("Körsträcka"));
  return { km, m2, cars: b.cars, bas: b.totalAfterRut, premium: p.totalAfterRut, kmCost: kmLine ? kmLine.amount : 0 };
})));
