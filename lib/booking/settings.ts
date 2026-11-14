// Small owner settings, stored in Upstash as one JSON object:  fx:settings
import { kv } from "./kv.ts";

export type Settings = {
  reviewOn: boolean;        // e-mail customers a request for a Google review after the job
  reviewUrl: string;        // the "write a review" link from Google Business Profile
  reviewDelayDays: number;  // days after the moving day
  // Time clock (Stämpelklocka) in the crew app: clock in/out only within `clockRadiusM` of the office.
  clockOn: boolean;
  office: { lat: number; lon: number; label: string } | null;
  clockRadiusM: number;
};
export const DEFAULTS: Settings = { reviewOn: false, reviewUrl: "", reviewDelayDays: 1, clockOn: false, office: null, clockRadiusM: 500 };
const KEY = "fx:settings";

export async function getSettings(): Promise<Settings> {
  const s = await kv<string | null>(["GET", KEY]);
  return { ...DEFAULTS, ...(s ? JSON.parse(s) : {}) };
}

export async function updateSettings(d: Record<string, unknown>): Promise<Settings> {
  const cur = await getSettings();
  if ("reviewOn" in d) cur.reviewOn = d.reviewOn === true;
  if ("reviewUrl" in d) {
    const u = typeof d.reviewUrl === "string" ? d.reviewUrl.trim() : "";
    if (u && !/^https:\/\/(g\.page|search\.google\.com|www\.google\.[a-z.]+|maps\.app\.goo\.gl|goo\.gl|g\.co)\//.test(u)) throw new Error("Klistra in länken från Google (börjar med https://g.page/ eller https://search.google.com/…).");
    cur.reviewUrl = u.slice(0, 500);
  }
  if ("reviewDelayDays" in d) { const n = Math.round(Number(d.reviewDelayDays)); if (!(n >= 0 && n <= 14)) throw new Error("0–14 dagar."); cur.reviewDelayDays = n; }
  if (cur.reviewOn && !cur.reviewUrl) throw new Error("Lägg in länken till Google först.");
  if ("office" in d) {
    const o = d.office as { lat?: unknown; lon?: unknown; label?: unknown } | null;
    if (o === null) cur.office = null;
    else {
      const lat = Number(o?.lat), lon = Number(o?.lon);
      if (!(lat > 55 && lat < 70 && lon > 10 && lon < 25)) throw new Error("Kontorets position måste ligga i Sverige.");
      cur.office = { lat: Math.round(lat * 1e6) / 1e6, lon: Math.round(lon * 1e6) / 1e6, label: typeof o?.label === "string" ? o.label.trim().slice(0, 160) : "" };
    }
  }
  if ("clockRadiusM" in d) { const n = Math.round(Number(d.clockRadiusM)); if (!(n >= 100 && n <= 5000)) throw new Error("Avstånd: 100–5 000 m."); cur.clockRadiusM = n; }
  if ("clockOn" in d) cur.clockOn = d.clockOn === true;
  if (cur.clockOn && !cur.office) throw new Error("Ange kontorets position först.");
  await kv(["SET", KEY, JSON.stringify(cur)]);
  return cur;
}

// Which done jobs should get the review e-mail today: once per booking, only with e-mail,
// at least `delay` days after the moving day but not older than 14 days (no surprise mails about old jobs).
export function reviewDue(b: { status: string; date?: string; reviewSentAt?: number; data: { email?: string } }, s: Settings, today: string): boolean {
  if (!s.reviewOn || !s.reviewUrl || b.status !== "done" || b.reviewSentAt || !b.data.email || !b.date) return false;
  const days = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(b.date + "T12:00:00Z")) / 864e5);
  return days >= s.reviewDelayDays && days <= 14;
}
