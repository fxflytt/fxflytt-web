// Prices for moves between two towns, from the real price engine (for the city pages).
// Input (argv[2]): JSON list of road distances in km. Output: [{km, bas, premium}] for a 60 m² home.
import { computePrice } from "../lib/pricing/pricelist.js";
import { readFileSync } from "node:fs";
const P = JSON.parse(readFileSync(new URL("../lib/pricing/prices.json", import.meta.url)));
const kms = JSON.parse(process.argv[2] || "[]");
console.log(JSON.stringify(kms.map((km) => ({
  km,
  bas: computePrice({ service: "move", areaM2: 60, distanceKm: km, pkg: "bas" }, P).totalAfterRut,
  premium: computePrice({ service: "move", areaM2: 60, distanceKm: km, pkg: "premium" }, P).totalAfterRut,
}))));
