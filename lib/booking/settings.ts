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
  salesGoal: number;        // signed value per month (kr, after RUT) – 0 = no goal
  // "Tipsa en vän": customers get a code after the move; a friend who books with it gets a discount,
  // the customer who recommended gets a reward (handed out by the office).
  refOn: boolean;
  refFriendKr: number;      // discount for the friend, kr off the offer
  refReward: string;        // what the recommending customer gets, in words
  // Tidrapporter: an unpaid break is deducted when a working day is longer than breakAfterH hours.
  breakAfterH: number;
  breakMin: number;
  slaMin: number;           // warn when a web request is unanswered this many minutes (0 = off)
  // "Trygg affär" in the offer the customer opens: shown when filled in.
  orgNr: string; fskatt: boolean; insured: boolean; insurer: string;
  // AI-teamet: the inbox assistant reads info@ (read-only) and the weekly sales report is e-mailed every Monday.
  aiInboxOn: boolean;
  aiReportOn: boolean;
  aiReportTo: string;       // who gets the weekly report (empty = info@)
  mailKeepDays: number;     // e-mails copied into the admin are deleted after this many days (GDPR)
  aiNames: AiNames;         // the AI colleagues' names (lib/agents/team.ts)
  aiAuto: AiAuto;           // what they may send by themselves – everything is off until the owner turns it on
  aiDailyMax: number;       // at most this many e-mails sent by the AI team per day
};
export type AiNames = { elsa: string; oskar: string; maja: string; nils: string };
export type AiAuto = {
  request: boolean;   // Elsa: makes a request in Offerter (with a price suggestion) from a quote e-mail
  reply: boolean;     // Elsa: answers simple questions herself
  ack: boolean;       // Maja: confirms at once that a complaint has arrived and when we answer
  followup: boolean; revive: boolean; calc: boolean; winback: boolean; upsell: boolean;   // Oskar's e-mails
  sms: boolean;       // Oskar: may follow up offers by SMS (customers without e-mail, or as the second follow-up)
  instant: boolean;   // Elsa: a personal e-mail at once to every new request from the website (instead of the standard receipt)
  instantSms: boolean;// Elsa: an SMS within a minute to every new request from the website
};
export const AI_AUTO_DEFAULT: AiAuto = { request: true, reply: false, ack: false, followup: false, revive: false, calc: false, winback: false, upsell: false, sms: false, instant: false, instantSms: false };
export const AI_NAMES_DEFAULT: AiNames = { elsa: "Elsa", oskar: "Oskar", maja: "Maja", nils: "Nils" };
// What the customer sees about the company in the offer.
export const trustView = (s: Settings) => (s.orgNr || s.fskatt || s.insured ? { orgNr: s.orgNr, fskatt: s.fskatt, insured: s.insured, insurer: s.insurer } : null);
export const DEFAULTS: Settings = { reviewOn: false, reviewUrl: "", reviewDelayDays: 1, clockOn: false, office: null, clockRadiusM: 500, salesGoal: 0, refOn: false, refFriendKr: 300, refReward: "300 kr presentkort när din vän har flyttat med oss", breakAfterH: 5, breakMin: 30, slaMin: 10, orgNr: "", fskatt: false, insured: false, insurer: "", aiInboxOn: true, aiReportOn: true, aiReportTo: "", mailKeepDays: 180, aiNames: AI_NAMES_DEFAULT, aiAuto: AI_AUTO_DEFAULT, aiDailyMax: 15 };
const KEY = "fx:settings";

export async function getSettings(): Promise<Settings> {
  const s = await kv<string | null>(["GET", KEY]);
  const v = s ? JSON.parse(s) : {};
  return { ...DEFAULTS, ...v, aiNames: { ...AI_NAMES_DEFAULT, ...(v.aiNames || {}) }, aiAuto: { ...AI_AUTO_DEFAULT, ...(v.aiAuto || {}) } };
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
  if ("breakAfterH" in d) { const n = Number(d.breakAfterH); if (!(n >= 0 && n <= 12)) throw new Error("Rast efter: 0–12 timmar."); cur.breakAfterH = Math.round(n * 2) / 2; }
  if ("orgNr" in d) { const o = String(d.orgNr || "").replace(/[^\d-]/g, "").slice(0, 13); if (o && !/^\d{6}-?\d{4}$/.test(o)) throw new Error("Organisationsnummer: XXXXXX-XXXX."); cur.orgNr = o && !o.includes("-") ? o.slice(0, 6) + "-" + o.slice(6) : o; }
  if ("fskatt" in d) cur.fskatt = d.fskatt === true;
  if ("insured" in d) cur.insured = d.insured === true;
  if ("insurer" in d) cur.insurer = String(d.insurer || "").trim().slice(0, 80);
  if ("slaMin" in d) { const n = Math.round(Number(d.slaMin)); if (!(n >= 0 && n <= 240)) throw new Error("Svarstid: 0–240 minuter."); cur.slaMin = n; }
  if ("breakMin" in d) { const n = Math.round(Number(d.breakMin)); if (!(n >= 0 && n <= 120)) throw new Error("Rast: 0–120 minuter."); cur.breakMin = n; }
  if ("refOn" in d) cur.refOn = d.refOn === true;
  if ("refFriendKr" in d) { const n = Math.round(Number(d.refFriendKr)); if (!(n >= 0 && n <= 10000)) throw new Error("Rabatt: 0–10 000 kr."); cur.refFriendKr = n; }
  if ("refReward" in d) { const t = typeof d.refReward === "string" ? d.refReward.trim().slice(0, 140) : ""; if (!t) throw new Error("Skriv vad kunden får."); cur.refReward = t; }
  if ("salesGoal" in d) { const n = Math.round(Number(d.salesGoal)); if (!(n >= 0 && n <= 100_000_000)) throw new Error("Ogiltigt mål."); cur.salesGoal = n; }
  if ("aiInboxOn" in d) cur.aiInboxOn = d.aiInboxOn === true;
  if ("aiReportOn" in d) cur.aiReportOn = d.aiReportOn === true;
  if ("aiReportTo" in d) { const t = String(d.aiReportTo || "").trim().toLowerCase().slice(0, 200); if (t && !/^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/.test(t)) throw new Error("Ogiltig e-postadress."); cur.aiReportTo = t; }
  if ("mailKeepDays" in d) { const n = Math.round(Number(d.mailKeepDays)); if (!(n >= 7 && n <= 730)) throw new Error("Spara mejl: 7–730 dagar."); cur.mailKeepDays = n; }
  if (d.aiNames && typeof d.aiNames === "object") for (const k of Object.keys(AI_NAMES_DEFAULT) as (keyof AiNames)[]) {
    const v = (d.aiNames as Record<string, unknown>)[k];
    if (typeof v === "string") { const t = v.trim().replace(/[<>"]/g, "").slice(0, 24); if (!t) throw new Error("Varje AI-kollega behöver ett namn."); cur.aiNames[k] = t; }
  }
  if (d.aiAuto && typeof d.aiAuto === "object") for (const k of Object.keys(AI_AUTO_DEFAULT) as (keyof AiAuto)[]) {
    const v = (d.aiAuto as Record<string, unknown>)[k];
    if (typeof v === "boolean") cur.aiAuto[k] = v;
  }
  if ("aiDailyMax" in d) { const n = Math.round(Number(d.aiDailyMax)); if (!(n >= 0 && n <= 100)) throw new Error("Max mejl per dag: 0–100."); cur.aiDailyMax = n; }
  if (cur.clockOn && !cur.office) throw new Error("Ange kontorets position först.");
  await kv(["SET", KEY, JSON.stringify(cur)]);
  return cur;
}

// Which done jobs should get the review e-mail today: once per booking, only with e-mail,
// at least `delay` days after the moving day but not older than 14 days (no surprise mails about old jobs).
export function reviewDue(b: { status: string; date?: string; reviewSentAt?: number; data: { email?: string } }, s: Settings, today: string): boolean {
  if (!((s.reviewOn && s.reviewUrl) || s.refOn) || b.status !== "done" || b.reviewSentAt || !b.data.email || !b.date) return false;
  const days = Math.round((Date.parse(today + "T12:00:00Z") - Date.parse(b.date + "T12:00:00Z")) / 864e5);
  return days >= s.reviewDelayDays && days <= 14;
}
