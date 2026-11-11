// Prints example prices (local move, under 15 km) from the real price engine, for the city pages.
import { computePrice } from "../lib/pricing/pricelist.js";
import { readFileSync } from "node:fs";
const P = JSON.parse(readFileSync(new URL("../lib/pricing/prices.json", import.meta.url)));
const out = [40, 60, 80, 100].map((m) => ({
  m2: m,
  bas: computePrice({ service: "move", areaM2: m, distanceKm: 0, pkg: "bas" }, P).totalAfterRut,
  premium: computePrice({ service: "move", areaM2: m, distanceKm: 0, pkg: "premium" }, P).totalAfterRut,
  stad: computePrice({ service: "cleaning", areaM2: m }, P).totalAfterRut,
}));
console.log(JSON.stringify(out));
