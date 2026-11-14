// The price list in use. Starts as lib/pricing/prices.json; the owner can change it in
// admin → Inställningar → Priser. Changes are stored in Upstash (fx:prices) with the 20 latest
// versions kept (fx:prices:log) so a change can be undone. Offers already sent keep their price.
import DEFAULT from "./prices.json" with { type: "json" };
import { kv, kvConfigured } from "../booking/kv.ts";

export type Prices = typeof DEFAULT & { changedAt?: number; changedBy?: string };
export const DEFAULT_PRICES = DEFAULT as Prices;
const KEY = "fx:prices", LOG = "fx:prices:log";
let cache: { at: number; p: Prices } | null = null;

export async function getPrices(): Promise<Prices> {
  if (!kvConfigured()) return DEFAULT_PRICES;
  if (cache && Date.now() - cache.at < 30_000) return cache.p;
  try {
    const s = await kv<string | null>(["GET", KEY]);
    const p = s ? (JSON.parse(s) as Prices) : DEFAULT_PRICES;
    cache = { at: Date.now(), p };
    return p;
  } catch { return cache?.p || DEFAULT_PRICES; }
}

const int = (v: unknown, lo: number, hi: number, what: string) => {
  const n = Number(v);
  if (!Number.isInteger(n) || n < lo || n > hi) throw new Error(`${what}: ${lo}–${hi}.`);
  return n;
};

// Takes what the admin page sends and returns a complete, checked price list. Throws with a Swedish message.
export function validatePrices(d: Record<string, unknown>, base: Prices = DEFAULT_PRICES): Prices {
  const rows = (v: unknown, cars: boolean, name: string) => {
    if (!Array.isArray(v) || v.length < 1 || v.length > 40) throw new Error(`${name}: 1–40 rader.`);
    let lastM2 = 0, lastCars = 0;
    return v.map((r, i) => {
      if (!Array.isArray(r)) throw new Error(`${name}: rad ${i + 1} är fel.`);
      const m2 = int(r[0], 1, 1000, `${name}, rad ${i + 1}, m²`), price = int(r[1], 100, 200000, `${name}, rad ${i + 1}, pris`);
      if (m2 <= lastM2) throw new Error(`${name}: m² måste öka för varje rad (rad ${i + 1}).`);
      lastM2 = m2;
      if (!cars) return [m2, price];
      const c = int(r[2], 1, 6, `${name}, rad ${i + 1}, bilar`);
      if (c < lastCars) throw new Error(`${name}: antal bilar kan inte minska (rad ${i + 1}).`);
      lastCars = c;
      return [m2, price, c];
    });
  };
  const h = (d.hourly || {}) as Record<string, unknown>, k = (d.km || {}) as Record<string, unknown>, b = (d.boxes || {}) as Record<string, unknown>;
  return {
    ...base,
    version: "admin-" + new Date().toISOString().slice(0, 16).replace("T", " "),
    moveFixed: rows(d.moveFixed, true, "Flytt") as typeof DEFAULT.moveFixed,
    cleaning: rows(d.cleaning, false, "Flyttstäd") as typeof DEFAULT.cleaning,
    km: { pricePerKm: int(k.pricePerKm, 0, 100, "Pris per km"), freeBelowKm: int(k.freeBelowKm, 0, 200, "Gratis under km") },
    hourly: { "2": int(h["2"], 100, 10000, "2 personer"), "3": int(h["3"], 100, 10000, "3 personer"), "4": int(h["4"], 100, 10000, "4 personer"), minHours: int(h.minHours, 1, 10, "Minsta antal timmar") },
    boxes: { buy: int(b.buy, 0, 50000, "Kartonger köp"), rent: int(b.rent, 0, 50000, "Kartonger hyra"), qty: int(b.qty, 1, 500, "Antal kartonger") },
  };
}

export async function savePrices(p: Prices, by: string): Promise<Prices> {
  const prev = await getPrices();
  const next: Prices = { ...p, changedAt: Date.now(), changedBy: by };
  await kv(["LPUSH", LOG, JSON.stringify(prev)]);
  await kv(["LTRIM", LOG, 0, 19]);
  await kv(["SET", KEY, JSON.stringify(next)]);
  cache = { at: Date.now(), p: next };
  return next;
}

export async function priceLog(): Promise<Prices[]> {
  const l = await kv<string[]>(["LRANGE", LOG, 0, 19]);
  return (l || []).map((s) => JSON.parse(s) as Prices);
}
