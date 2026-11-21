// "Varför vi förlorar" – Nils compares the offers we won with the ones we lost over a period (default 90 days):
// reasons the customers gave, towns, home size, price, how fast we answered, whether the customer even opened the
// offer, and whether anyone called. The numbers are counted by code; the AI reads them (and the customers' own words)
// and writes what is going wrong and what to change.
//   fx:lostrep   the latest analysis
import { kv } from "../booking/kv.ts";
import { DECLINE_REASONS, type Booking, type DeclineReason } from "../booking/store.ts";
import { askJson, MODEL_WRITE, quote, type JsonSchema } from "./claude.ts";

const DAY = 864e5;
const won = (b: Booking) => b.status === "signed" || b.status === "done";
const median = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return Math.round(s[Math.floor(s.length / 2)]); };
const avg = (l: number[]) => (l.length ? Math.round(l.reduce((a, b) => a + b, 0) / l.length) : null);
const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();
const rate = (w: number, l: number) => (w + l ? Math.round((w * 100) / (w + l)) : null);

export type Group = { key: string; won: number; lost: number; winRate: number | null };
export type LostNumbers = {
  days: number; from: string; to: string;
  offers: number; won: number; lost: number; noAnswer: number; winRate: number | null; lostValue: number;
  reasons: { reason: string; n: number }[];
  towns: Group[]; sizes: Group[]; prices: Group[];
  avgPrice: { won: number | null; lost: number | null }; pricePerM2: { won: number | null; lost: number | null };
  responseMin: { won: number | null; lost: number | null };          // request → first answer (web)
  hoursToOffer: { won: number | null; lost: number | null };          // request → offer sent
  neverOpened: number;               // lost offers the customer never opened
  noCall: number;                    // lost offers where nobody called
  noFollowUp: number;                // lost offers without a reminder, call or personal e-mail
  discount: { given: number; wonAfter: number };
  quotes: string[];                  // what the customers wrote when they said no
};

const isLost = (b: Booking, now: number) => (b.status === "declined" && !b.nextId && !/^Ersatt av version/.test(b.decline?.text || ""))
  || (b.status === "sent" && !b.signedAt && ((b.sentAt && now - b.sentAt > 14 * DAY) || (b.validUntil && b.validUntil < new Date(now).toISOString().slice(0, 10)) || (b.date && b.date <= new Date(now).toISOString().slice(0, 10))));

export function lostNumbers(all: Booking[], days: number, now = Date.now()): LostNumbers {
  const since = now - days * DAY;
  const offers = all.filter((b) => b.sentAt && b.sentAt >= since && !b.nextId);
  const W = offers.filter(won), L = offers.filter((b) => isLost(b, now));
  const noAnswer = L.filter((b) => b.status === "sent").length;
  const reasons = new Map<string, number>();
  for (const b of L) {
    const r = b.status === "sent" ? (b.validUntil && b.validUntil < new Date(now).toISOString().slice(0, 10) ? "Offerten gick ut utan svar" : "Svarade aldrig") : DECLINE_REASONS[(b.decline?.reason || "other") as DeclineReason] || "Annat";
    reasons.set(r, (reasons.get(r) || 0) + 1);
  }
  const group = (key: (b: Booking) => string | null, min = 2): Group[] => {
    const m = new Map<string, { won: number; lost: number }>();
    for (const [list, f] of [[W, "won"], [L, "lost"]] as const) for (const b of list) {
      const k = key(b); if (!k) continue;
      const x = m.get(k) || { won: 0, lost: 0 }; x[f]++; m.set(k, x);
    }
    return [...m].filter(([, x]) => x.won + x.lost >= min).map(([key, x]) => ({ key, ...x, winRate: rate(x.won, x.lost) }))
      .sort((a, b) => b.won + b.lost - (a.won + a.lost)).slice(0, 8);
  };
  const m2 = (b: Booking) => Number(b.data.areaM2) || 0;
  const sizeBand = (b: Booking) => { const a = m2(b); return !a ? null : a <= 40 ? "upp till 40 m²" : a <= 70 ? "41–70 m²" : a <= 100 ? "71–100 m²" : "över 100 m²"; };
  const priceBand = (b: Booking) => { const p = b.offer?.total || 0; return !p ? null : p < 5000 ? "under 5 000 kr" : p < 10000 ? "5 000–9 999 kr" : p < 20000 ? "10 000–19 999 kr" : "20 000 kr eller mer"; };
  const total = (l: Booking[]) => l.map((b) => b.offer?.total || 0).filter((x) => x > 0);
  const perM2 = (l: Booking[]) => l.filter((b) => m2(b) && b.offer?.total).map((b) => b.offer!.total / m2(b));
  const resp = (l: Booking[]) => l.filter((b) => b.source === "web" && b.firstResponseAt).map((b) => (b.firstResponseAt! - b.createdAt) / 6e4);
  const toOffer = (l: Booking[]) => l.filter((b) => b.sentAt).map((b) => (b.sentAt! - b.createdAt) / 36e5);
  const disc = offers.filter((b) => b.discount);
  return {
    days, from: new Date(since).toISOString().slice(0, 10), to: new Date(now).toISOString().slice(0, 10),
    offers: offers.length, won: W.length, lost: L.length, noAnswer, winRate: rate(W.length, L.length), lostValue: total(L).reduce((a, b) => a + b, 0),
    reasons: [...reasons].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    towns: group((b) => town(b.data.from) || null), sizes: group(sizeBand), prices: group(priceBand),
    avgPrice: { won: avg(total(W)), lost: avg(total(L)) }, pricePerM2: { won: avg(perM2(W)), lost: avg(perM2(L)) },
    responseMin: { won: median(resp(W)), lost: median(resp(L)) }, hoursToOffer: { won: median(toOffer(W)), lost: median(toOffer(L)) },
    neverOpened: L.filter((b) => !b.views).length,
    noCall: L.filter((b) => !(b.calls || []).length).length,
    noFollowUp: L.filter((b) => !(b.calls || []).length && !(b.reminders || []).length && !(b.closings || []).length).length,
    discount: { given: disc.length, wonAfter: disc.filter(won).length },
    quotes: L.map((b) => b.decline?.text || "").filter((t) => t.trim().length > 3).slice(0, 25).map((t) => t.slice(0, 200)),
  };
}

export type LostAnalysis = { headline: string; findings: string[]; fixes: string[] };
export type LostReport = { createdAt: number; numbers: LostNumbers; analysis: LostAnalysis | null; aiError?: string };
const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["headline", "findings", "fixes"],
  properties: {
    headline: { type: "string", description: "En mening: den viktigaste orsaken till att vi förlorar affärer." },
    findings: { type: "array", items: { type: "string" }, description: "3–5 iakttagelser som bygger på siffrorna (jämför vunna och förlorade). Nämn siffror." },
    fixes: { type: "array", items: { type: "string" }, description: "3–5 konkreta ändringar att göra från i morgon (t.ex. svara snabbare, ringa alla som inte öppnat offerten, erbjuda Bas-paketet vid pris). Föreslå inte att sänka alla priser." },
  },
};
export async function analyseLost(n: LostNumbers): Promise<LostAnalysis> {
  const a = await askJson<LostAnalysis>({
    model: MODEL_WRITE, effort: "medium", schema: SCHEMA, maxTokens: 6000,
    system: `Du är försäljningsanalytiker åt FX Flytt AB, en flyttfirma i Mälardalen. Du får jämförelsen mellan vunna och förlorade offerter (räknad av systemet – den stämmer)
och kundernas egna ord när de tackade nej. Förklara på enkel svenska varför vi förlorar affärer och vad vi ska ändra. Använd bara underlaget.
Är underlaget litet (färre än 10 förlorade): säg det och var försiktig med slutsatserna. Belopp är i kronor efter RUT.`,
    user: quote("underlag", JSON.stringify(n)),
  });
  const s = (v: unknown, k: number) => (typeof v === "string" ? v.trim().slice(0, k) : "");
  const l = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 400)).filter(Boolean).slice(0, 6) : []);
  return { headline: s(a.headline, 200), findings: l(a.findings), fixes: l(a.fixes) };
}
export async function saveLost(r: LostReport) { await kv(["SET", "fx:lostrep", JSON.stringify(r)]); }
export async function getLost(): Promise<LostReport | null> { const s = await kv<string | null>(["GET", "fx:lostrep"]); return s ? JSON.parse(s) : null; }
