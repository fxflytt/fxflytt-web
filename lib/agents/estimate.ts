// A price suggestion from an e-mail: towns + living area → the same price engine as the website calculator.
// It is a suggestion for the office (town centres, not exact addresses) – the offer is always checked before it is sent.
import { quoteRoute } from "../assistant/distance.ts";
import type { Extracted } from "./inbox.ts";

export type Estimate = { from: string; to: string; km: number; m2: number; bas?: number; premium?: number; lines?: { label: string; amount: number }[] };

export function areaOf(size: string): number | null {
  const m = String(size || "").match(/(\d{2,3})\s*(m2|m²|m\^2|kvm|kvadrat|sqm)/i);
  const n = m ? Number(m[1]) : NaN;
  return n >= 10 && n <= 400 ? n : null;
}

/** `text` is the customer's own e-mail: if the AI did not pick up the living area, it is read from there ("60 m²", "60 kvm"). */
export function estimate(e: Extracted | undefined, prices: unknown, text = ""): Estimate | null {
  if (!e?.from || !e.to) return null;
  const m2 = areaOf(e.size) || (e.areaM2 && e.areaM2 >= 10 && e.areaM2 <= 400 ? e.areaM2 : null) || areaOf(text);
  if (!m2) return null;
  const town = (s: string) => s.split(",").pop()!.replace(/\d/g, "").trim();
  const q = quoteRoute({ from: town(e.from), to: town(e.to), area_m2: m2 }, prices) as Record<string, unknown>;
  if (q.error || !q.prices) return null;
  const p = q.prices as Record<string, { total_after_rut_kr?: number; lines?: { label: string; amount: number }[] }>;
  if (!p.bas?.total_after_rut_kr) return null;
  return { from: String(q.from), to: String(q.to), km: Number(q.distance_km), m2, bas: p.bas.total_after_rut_kr, premium: p.premium?.total_after_rut_kr, lines: p.bas.lines };
}
