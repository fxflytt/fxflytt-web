// Prices from an e-mail: living area (+ towns when known) → the same price engine as the website calculator
// (lib/pricing/pricelist.js). Used by Elsa so that every customer who gives the living area gets an approximate price.
// Town centres, not exact addresses – always presented as "ungefär", the exact price comes in the offer.
// Piano, office and moving abroad are never priced here (they are priced in an offer).
import { computePrice } from "../pricing/pricelist.js";
import { findTown, roadKm } from "../assistant/distance.ts";
import type { Extracted } from "./inbox.ts";

export const CALC_URL = "https://www.fxflytt.se/#prisraknare";
export type Service = "move" | "cleaning" | "move_cleaning" | "packing" | "piano" | "office" | "abroad" | "storage" | "other" | "";
export const NO_PRICE: Service[] = ["piano", "office", "abroad"];

export type Estimate = {
  service: "move" | "cleaning";
  from: string; to: string; km: number | null; sameTown: boolean; m2: number;
  bas?: number; premium?: number; deluxe?: number;   // moving packages, after RUT
  cleaning?: number;                                  // moving-cleaning only, after RUT
  lines?: { label: string; amount: number }[];        // Bas (or cleaning) lines, for the request in Offerter
  kmUnknown?: boolean;                                // towns not known: price without the km cost
};

export function areaOf(size: string): number | null {
  const m = String(size || "").match(/(\d{2,3})\s*(m2|m²|m\^2|kvm|kvadrat|sqm|square)/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 10 && n <= 400 ? n : null;
}
const town = (s: string) => s.split(",").pop()!.replace(/\d/g, "").trim();

/** `text` is the customer's own e-mail: if the AI did not pick up the living area, it is read from there ("60 m²", "60 kvm"). */
export function estimate(e: (Extracted & { service?: Service }) | undefined, prices: unknown, text = ""): Estimate | null {
  if (!e) return null;
  const service = (e.service || "") as Service;
  if (NO_PRICE.includes(service)) return null;
  const m2 = areaOf(e.size) || (e.areaM2 && e.areaM2 >= 10 && e.areaM2 <= 400 ? e.areaM2 : null) || areaOf(text);
  if (!m2) return null;
  const P = prices as never;
  const total = (input: Record<string, unknown>) => {
    try { const q = computePrice(input as never, P) as { totalAfterRut: number | null; lines: { label: string; amount: number }[] }; return q.totalAfterRut == null ? null : q; }
    catch { return null; }
  };
  if (service === "cleaning") {
    const q = total({ service: "cleaning", areaM2: m2 });
    return q ? { service: "cleaning", from: town(e.from || e.to || ""), to: "", km: null, sameTown: false, m2, cleaning: q.totalAfterRut!, lines: q.lines } : null;
  }
  const a = e.from ? findTown(town(e.from)) : null, b = e.to ? findTown(town(e.to)) : null;
  const sameTown = !!a && !!b && a[0] === b[0];
  // Only one town given, or the same town: a move within the town (under the free km limit).
  const km = a && b ? (sameTown ? 0 : roadKm(a, b)) : (a || b) && !(e.from && e.to) ? 0 : null;
  const base = { service: "move", areaM2: m2, ...(km == null ? {} : { distanceKm: km }) };
  const bas = total({ ...base, pkg: "bas" });
  if (!bas) return null;
  const premium = total({ ...base, pkg: "premium" }), deluxe = total({ ...base, pkg: "deluxe", crew: 2, hours: 3 });
  return {
    service: "move", from: a ? a[0] : town(e.from || ""), to: b ? b[0] : town(e.to || ""), km, sameTown: sameTown || (km === 0 && !(a && b)), m2,
    bas: bas.totalAfterRut!, premium: premium?.totalAfterRut ?? undefined, deluxe: deluxe?.totalAfterRut ?? undefined, lines: bas.lines,
    ...(km == null ? { kmUnknown: true } : {}),
  };
}

const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/ | /g, " ") + " kr";
/** The price facts for the reply, in plain Swedish for the AI. */
export function estimateText(x: Estimate): string {
  if (x.service === "cleaning") return `Flyttstäd ${x.m2} m²: ${kr(x.cleaning!)} efter RUT (fönster och balkong ingår, 7 dagars städgaranti).`;
  const where = x.sameTown ? `inom ${x.from || x.to || "samma ort"} (ingen körsträcka under 15 km)` : x.km != null ? `${x.from}–${x.to}, ca ${x.km} km` : "orterna är okända – priset är utan körsträcka (12 kr/km per flyttbil tillkommer om avståndet är 15 km eller mer)";
  return [
    `Ungefärligt pris efter RUT för ${x.m2} m², ${where}:`,
    `- Bas (bara flytt): ${kr(x.bas!)}`,
    x.premium ? `- Premium (flytt + flyttstäd, −10 %): ${kr(x.premium)}` : "",
    x.deluxe ? `- Deluxe (flytt + flyttstäd −20 % + 3 timmars packning för 2 personer): ${kr(x.deluxe)}` : "",
  ].filter(Boolean).join("\n");
}

/** One line for the request in Offerter: "Kungsör–Arboga ca 19 km, 75 m²". */
export function estimateNote(x: Estimate): string {
  if (x.service === "cleaning") return `flyttstäd ${x.m2} m²`;
  return `${x.sameTown ? `inom ${x.from || x.to}` : x.km != null ? `${x.from}–${x.to} ca ${x.km} km` : "orterna okända, utan körsträcka"}, ${x.m2} m²`;
}
