// Example prices for the "Vad kostar en flytt?" guide, from the real price engine (all after RUT).
import { computePrice } from "../lib/pricing/pricelist.js";
import { readFileSync } from "node:fs";
const P = JSON.parse(readFileSync(new URL("../lib/pricing/prices.json", import.meta.url)));
const t = (inp) => computePrice(inp, P).totalAfterRut;
const homes = [["1 rok", 35], ["2 rok", 60], ["3 rok", 80], ["4 rok", 100], ["Villa", 140]];
const out = {
  homes: homes.map(([name, m2]) => ({
    name, m2,
    bas: t({ service: "move", areaM2: m2, distanceKm: 0, pkg: "bas" }),
    stad: t({ service: "cleaning", areaM2: m2 }),
    premium: t({ service: "move", areaM2: m2, distanceKm: 0, pkg: "premium" }),
    cars: computePrice({ service: "move", areaM2: m2, distanceKm: 0, pkg: "bas" }, P).cars,
  })),
  km: [10, 30, 60, 120].map((km) => ({ km, bas: t({ service: "move", areaM2: 60, distanceKm: km, pkg: "bas" }) })),
  hourly: [[2, 3], [2, 5], [3, 4], [4, 6]].map(([crew, hours]) => ({ crew, hours, total: t({ service: "hourly", crew, hours }) })),
  rates: P.hourly, boxes: P.boxes, perKm: P.km.pricePerKm, freeKm: P.km.freeBelowKm,
  deluxe60: t({ service: "move", areaM2: 60, distanceKm: 0, pkg: "deluxe", crew: 2, hours: 3 }),
};
console.log(JSON.stringify(out));
