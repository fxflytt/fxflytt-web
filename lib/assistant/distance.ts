// Distance and price between two towns, for the chat assistant (tool "rakna_flytt").
// Same towns, same distance method and same price engine as the price calculator on fxflytt.se:
// straight line between the towns' centres × 1.25, rounded – an estimate of the road distance.
import TOWNS from "./towns.json" with { type: "json" };
import { computePrice } from "../pricing/pricelist.js";

type Town = [string, string, number, number];
const norm = (t: string) => t.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\b(kommun|centrum|stad)\b/g, "").replace(/[^a-z]/g, "");

/** Finds a town by name ("Örebro", "orebro", "Örebro centrum"). Null if it is not in the list. */
export function findTown(name: string): Town | null {
  const n = norm(String(name ?? ""));
  if (!n) return null;
  return (TOWNS as Town[]).find((t) => norm(t[0]) === n) ?? null;
}

export function roadKm(a: Town, b: Town): number {
  const r = Math.PI / 180, dLa = (b[2] - a[2]) * r, dLo = (b[3] - a[3]) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a[2] * r) * Math.cos(b[2] * r) * Math.sin(dLo / 2) ** 2;
  return Math.max(1, Math.round(2 * 6371 * Math.asin(Math.sqrt(h)) * 1.25));
}

type Input = { from?: string; to?: string; area_m2?: number; package?: string };

/** What the assistant gets back: distance, km cost and fixed prices after RUT – or what is missing. */
export function quoteRoute(input: Input, P: unknown) {
  const a = findTown(input.from ?? ""), b = findTown(input.to ?? "");
  const unknown = [!a && input.from, !b && input.to].filter(Boolean);
  if (!a || !b) return { error: "okänd ort", unknown_towns: unknown, hint: "Be kunden om närmaste större ort, eller hänvisa till prisräknaren på fxflytt.se som tar hela adresser." };
  const km = roadKm(a, b);
  const prices = P as { km: { pricePerKm: number; freeBelowKm: number } };
  const kmCost = km >= prices.km.freeBelowKm ? km * prices.km.pricePerKm : 0;
  const out: Record<string, unknown> = {
    from: a[0], to: b[0], distance_km: km, km_cost_per_truck_kr: kmCost,
    km_rule: "Körsträckan räknas per flyttbil (varje bil kör hela vägen). Antal bilar beror på boytan – se raderna i priserna.",
    note: "Ungefärligt vägavstånd mellan orternas centrum. Exakt pris räknas på kundens adresser i prisräknaren eller offerten.",
  };
  const m2 = Number(input.area_m2);
  if (!(m2 > 0)) { out.missing = "boyta (m²) – fråga kunden"; return out; }
  const pkgs = input.package && ["bas", "premium", "deluxe"].includes(input.package) ? [input.package] : ["bas", "premium"];
  const res: Record<string, unknown> = {};
  for (const pkg of pkgs) {
    try {
      const q = computePrice({ service: "move", areaM2: m2, distanceKm: km, pkg, crew: 2, hours: 3 } as never, P as never) as { totalAfterRut: number | null; lines: { label: string; amount: number }[]; onRequest?: string | null };
      res[pkg] = q.totalAfterRut == null ? { on_request: q.onRequest || "pris enligt offert" } : { total_after_rut_kr: q.totalAfterRut, lines: q.lines };
    } catch (e) { res[pkg] = { error: e instanceof Error ? e.message : "fel" }; }
  }
  out.area_m2 = m2; out.prices = res;
  if (pkgs.includes("deluxe")) out.deluxe_note = "Deluxe räknat med 3 timmars packning/montering (minst 3 timmar).";
  return out;
}

export const RAKNA_FLYTT_TOOL = {
  name: "rakna_flytt",
  description: "Räknar ungefärligt avstånd mellan två svenska orter och fast pris efter RUT för en flytt hos FX Flytt, med samma prislista och metod som prisräknaren på fxflytt.se. Använd när kunden frågar om avstånd, körsträcka eller pris för en flytt mellan två orter.",
  input_schema: {
    type: "object",
    properties: {
      from: { type: "string", description: "Ort kunden flyttar från, t.ex. Kungsör" },
      to: { type: "string", description: "Ort kunden flyttar till, t.ex. Örebro" },
      area_m2: { type: "number", description: "Boyta i m² (om kunden har sagt den)" },
      package: { type: "string", enum: ["bas", "premium", "deluxe"], description: "Paket om kunden har valt ett; annars utelämna så räknas Bas och Premium" },
    },
    required: ["from", "to"],
  },
};
