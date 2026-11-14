// "Välj paket" in the offer: the customer sees Bas, Premium and Deluxe side by side and picks one.
// Only for fixed-price moves made with the price list (not a hand-set price, not after a discount).
// Prices are worked out on the server when the offer is sent and kept on the booking, so what the
// customer sees cannot change afterwards. The package the office chose keeps its exact offer lines.
import { computePrice } from "../pricing/pricelist.js";
import type { Prices } from "../pricing/current.ts";
import type { Booking } from "./store.ts";

export type PkgId = "bas" | "premium" | "deluxe";
export type Pkg = { id: PkgId; name: string; desc: string; total: number; lines: { label: string; amount: number }[] };
export const PKG_NAMES: Record<PkgId, [string, string]> = {
  bas: ["Bas", "Flytt till fast pris"],
  premium: ["Premium", "Flytt + flyttstäd, 10 % rabatt"],
  deluxe: ["Deluxe", "Flytt + flyttstäd + packning, 20 % rabatt"],
};
export const SIZE_LABEL: Record<PkgId, string> = { bas: "Bara flytt – Bas", premium: "Flytt + flyttstäd – Premium, 10 % rabatt", deluxe: "Flytt + flyttstäd + packning – Deluxe, 20 % rabatt" };

export function currentPkg(b: Booking): PkgId | null {
  const s = b.data.size || "";
  return /Deluxe/i.test(s) ? "deluxe" : /Premium/i.test(s) ? "premium" : /Bas\b/i.test(s) ? "bas" : null;
}

export function packagesFor(b: Booking, P: Prices): Pkg[] | null {
  const cur = currentPkg(b), m2 = Number(b.data.areaM2);
  if (!cur || !(m2 > 0) || !b.offer || b.offer.custom || b.discount) return null;
  const lines = b.offer.lines || [];
  const boxes = lines.some((l) => /kartong.*köp/i.test(l.label)) ? "buy" : lines.some((l) => /kartong.*hyr/i.test(l.label)) ? "rent" : "none";
  const out: Pkg[] = [];
  for (const id of ["bas", "premium", "deluxe"] as PkgId[]) {
    let q;
    try { q = computePrice({ service: "move", pkg: id, areaM2: m2, distanceKm: b.data.distanceKm ?? 0, boxes, volumeM3: b.data.volume?.m3 ?? null, crew: 2, hours: P.hourly.minHours } as never, P); }
    catch { return null; }
    if (q.totalAfterRut == null) return null;
    const mine = id === cur;
    const ref = !mine && b.referral && b.referral.kr > 0 ? [{ label: `Rabattkod ${b.referral.code} (tips från en vän)`, amount: -b.referral.kr }] : [];
    if (ref.length) { q.lines = [...q.lines, ...ref]; q.totalAfterRut = Math.max(0, q.totalAfterRut - b.referral!.kr); }
    out.push({ id, name: PKG_NAMES[id][0], desc: PKG_NAMES[id][1],
      total: mine ? b.offer.total : q.totalAfterRut,
      lines: mine ? lines.map((l) => ({ label: l.label, amount: l.amount })) : q.lines.map((l: { label: string; amount: number }) => ({ label: l.label, amount: l.amount })) });
  }
  return out;
}
