// Prisråd: what similar offers sold for, and the chance to win at a few prices around the current one.
// Counted from our own offers (no guessing): offers of the same kind (move / cleaning / both) and a similar
// home size and distance, from the last 18 months, that were won (signed) or lost (said no, or never answered).
// The chance at a price is a weighted share of won offers among those with a similar price per m² – the
// closer the price per m², the more an offer counts – pulled towards the overall win rate when there are few.
import type { Booking } from "./store.ts";

const DAY = 864e5;
export type Kind = "move" | "clean" | "both" | "other";
export function kindOf(b: Pick<Booking, "data">): Kind {
  const s = (b.data.size || "").toLowerCase();
  const clean = /städ/.test(s), move = /flytt(?!städ)|bas\b|premium|deluxe|bohag/.test(s.replace(/flyttstäd\w*/g, ""));
  return clean && move ? "both" : clean ? "clean" : move ? "move" : "other";
}
const area = (b: Pick<Booking, "data">) => { const n = Number(String(b.data.areaM2 || "").replace(",", ".")); return n > 5 && n < 2000 ? n : 0; };
const km = (b: Pick<Booking, "data">) => Number(b.data.distanceKm) || 0;
const today = (now: number) => new Date(now).toISOString().slice(0, 10);
export const outcome = (b: Booking, now: number): "won" | "lost" | null => {
  if (b.nextId || !b.offer?.total) return null;
  if (b.status === "signed" || b.status === "done") return "won";
  if (b.status === "declined") return /^Ersatt av version/.test(b.decline?.text || "") ? null : "lost";
  if (b.status === "sent" && b.sentAt && (now - b.sentAt > 14 * DAY || (b.date && b.date < today(now)) || (b.validUntil && b.validUntil < today(now)))) return "lost";
  return null;
};

export type Point = { price: number; chance: number; current?: boolean; best?: boolean };
export type Advice =
  | { ok: false; n: number; why: string }
  | { ok: true; n: number; won: number; lost: number; area: number; kind: Kind;
      wonMedian: number | null; lostMedian: number | null;   // typical price for this home size, from won / lost offers
      chanceNow: number; points: Point[]; examples: { id: string; name: string; total: number; areaM2: number; won: boolean; date: string }[] };

const median = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
const r100 = (n: number) => Math.round(n / 100) * 100;

export function priceAdvice(b: Booking, all: Booking[], now = Date.now()): Advice {
  const a = area(b), kind = kindOf(b), total = b.offer?.total || 0;
  if (!a) return { ok: false, n: 0, why: "Skriv boytan (m²) så kan prisrådet jämföra med liknande offerter." };
  if (!total) return { ok: false, n: 0, why: "Sätt ett pris först." };
  const since = now - 540 * DAY;
  const pool = all.filter((x) => x.id !== b.id && (x.sentAt || x.createdAt) >= since && kindOf(x) === kind && area(x) && outcome(x, now));
  const pick = (spread: number, useKm: boolean) => pool.filter((x) => {
    const r = area(x) / a; if (r < 1 - spread || r > 1 / (1 - spread)) return false;
    if (!useKm) return true;
    const d1 = km(b), d2 = km(x); return Math.abs(d1 - d2) <= Math.max(30, 0.5 * Math.max(d1, d2));
  });
  let list = pick(0.3, true);
  if (list.length < 8) list = pick(0.3, false);
  if (list.length < 8) list = pick(0.5, false);
  if (list.length < 5) return { ok: false, n: list.length, why: `För få liknande offerter än (${list.length} st). Prisrådet blir bättre ju fler offerter som blir vunna eller förlorade.` };
  const rows = list.map((x) => ({ x, per: x.offer!.total / area(x), won: outcome(x, now) === "won" }));
  const base = rows.filter((r) => r.won).length / rows.length;
  const chance = (price: number) => {
    const per = price / a; let w = 0, sw = 0;
    for (const r of rows) { const d = Math.log(r.per / per), k = Math.exp(-(d * d) / (2 * 0.15 * 0.15)); w += k; if (r.won) sw += k; }
    const PRIOR = 3;
    return Math.round(((sw + PRIOR * base) / (w + PRIOR)) * 100);
  };
  const prices = [...new Set([0.85, 0.92, 1, 1.08, 1.15].map((m) => (m === 1 ? total : r100(total * m))))];
  const points: Point[] = prices.map((p) => ({ price: p, chance: chance(p), ...(p === total ? { current: true } : {}) }));
  // Best = the most money expected (price × chance); only marked when it beats the current price by a clear margin.
  const ev = (p: Point) => p.price * p.chance;
  const top = points.reduce((m, p) => (ev(p) > ev(m) ? p : m), points.find((p) => p.current)!);
  if (!top.current && ev(top) > ev(points.find((p) => p.current)!) * 1.04) top.best = true;
  const wonPer = rows.filter((r) => r.won).map((r) => r.per), lostPer = rows.filter((r) => !r.won).map((r) => r.per);
  const wm = median(wonPer), lm = median(lostPer);
  return {
    ok: true, n: rows.length, won: wonPer.length, lost: lostPer.length, area: a, kind,
    wonMedian: wm == null ? null : r100(wm * a), lostMedian: lm == null ? null : r100(lm * a),
    chanceNow: chance(total), points,
    examples: rows.sort((p, q) => Math.abs(area(p.x) - a) - Math.abs(area(q.x) - a)).slice(0, 6)
      .map((r) => ({ id: r.x.id, name: r.x.data.name, total: r.x.offer!.total, areaM2: area(r.x), won: r.won, date: r.x.date || "" })),
  };
}
