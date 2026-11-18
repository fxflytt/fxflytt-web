// Oskar – the AI salesman. Finds the customers worth an e-mail today and writes it, in five situations:
//   followup  offer sent, not signed yet (best chance first: opened the offer, lately, asked to be called back …)
//   revive    offer sent 2–6 weeks ago with no answer – one last friendly try while the date is still free
//   calc      "Få priset på mejl" in the website calculator, but never asked for an offer
//   winback   said no because of price, date or another company – offer a cheaper package or another date
//   upsell    booked – offer moving-cleaning, packing or boxes before the move
// He never changes a price or promises a discount: if a discount would help he says so as a tip to the office.
// Each customer gets each kind at most once (follow-up at most twice, three days apart). Customers who said
// no to campaign e-mails get only the follow-up of their own offer.
import { askJson, MODEL_WRITE, HOUSE_RULES, quote, type JsonSchema } from "./claude.ts";
import { mobileE164, SMS_MAX } from "../sms/send.ts";
import { SALES_PLAYBOOK, KIND_PLAYBOOK, type WinExample } from "./playbook.ts";
import { CALL_OUTCOMES, DECLINE_REASONS, type Booking, type DeclineReason } from "../booking/store.ts";

export type SalesKind = "followup" | "revive" | "calc" | "winback" | "upsell";
export const SALES_KINDS: Record<SalesKind, { label: string; why: string }> = {
  followup: { label: "Följ upp offert", why: "Offerten är skickad men inte signerad" },
  revive: { label: "Väck förfallen offert", why: "Inget svar på 2–6 veckor" },
  calc: { label: "Kalkyl-lead", why: "Räknade pris på hemsidan men bad aldrig om offert" },
  winback: { label: "Vinn tillbaka", why: "Tackade nej" },
  upsell: { label: "Merförsäljning", why: "Bokad – erbjud flyttstäd, packning eller kartonger" },
};
export type Closing = { subject: string; body: string; tip: string };
export type Candidate = { b: Booking; kind: SalesKind; score: number; why: string; channel: "email" | "sms" };

const DAY = 864e5;
const day = (t?: number) => (t ? new Date(t).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Stockholm" }) : "");
const sthlm = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const sent = (b: Booking, k: SalesKind) => (b.closings || []).filter((c) => (c.kind || "followup") === k);
const hasLine = (b: Booking, re: RegExp) => (b.offer?.lines || []).some((l) => re.test(l.label)) || (b.extras || []).some((e) => b.extrasChosen?.includes(e.id) && re.test(e.label)) || re.test(b.data.size || "");

/** Who Oskar should write to today, best first. */
export function salesCandidates(all: Booking[], now = Date.now()): Candidate[] {
  const today = sthlm(now), out: Candidate[] = [];
  const future = (b: Booking) => !b.date || b.date > today;
  const lastCall = (b: Booking) => (b.calls || []).slice(-1)[0]?.outcome;
  for (const b of all) {
    const mobile = !!mobileE164(b.data.phone);
    if ((!b.data.email && !mobile) || b.nextId || lastCall(b) === "notinterested") continue;
    // E-mail first; the second follow-up (or a customer without e-mail) gets an SMS.
    const ch = (k: SalesKind): "email" | "sms" => (!b.data.email || (k === "followup" && mobile && sent(b, "followup").length === 1)) ? "sms" : "email";
    const age = b.sentAt ? now - b.sentAt : 0;
    if (b.status === "sent" && b.token && !b.signedAt && future(b)) {
      if (age <= 14 * DAY) {
        const f = sent(b, "followup");
        if (f.length < 2 && !(f.length && now - f[f.length - 1].at < 3 * DAY) && age >= DAY) {
          let score = 30;
          if (b.views) score += 25 + Math.min(3, b.views) * 5;
          if (b.lastViewAt && now - b.lastViewAt < 2 * DAY) score += 15;
          if (lastCall(b) === "callback") score += 10;
          if (b.date && Date.parse(b.date) - now < 21 * DAY) score += 10;
          out.push({ b, kind: "followup", channel: ch("followup"), score, why: b.views ? `Öppnade offerten ${b.views} gång${b.views > 1 ? "er" : ""}, senast ${day(b.lastViewAt)}` : "Har inte öppnat offerten" });
        }
      } else if (age <= 45 * DAY && !sent(b, "revive").length) {
        out.push({ b, kind: "revive", channel: ch("revive"), score: 15 + (b.views ? 10 : 0), why: `Skickad ${day(b.sentAt)}, inget svar` });
      }
    }
    if (b.noMarketing || !b.data.email) continue;
    if (b.lead === "calc" && b.status === "new" && now - b.createdAt >= DAY && now - b.createdAt <= 10 * DAY && !sent(b, "calc").length)
      out.push({ b, kind: "calc", channel: "email", score: 25, why: `Räknade pris ${day(b.createdAt)}${b.offer ? ` (${b.offer.total} kr)` : ""}` });
    if (b.status === "declined" && b.declinedAt && now - b.declinedAt >= 2 * DAY && now - b.declinedAt <= 21 * DAY && future(b) && !sent(b, "winback").length) {
      const r = (b.decline?.reason || "other") as DeclineReason;
      if (r !== "no_move" && !/^Ersatt av version/.test(b.decline?.text || ""))
        out.push({ b, kind: "winback", channel: "email", score: r === "price" ? 22 : 15, why: `Tackade nej: ${DECLINE_REASONS[r]}${b.decline?.text ? " – " + b.decline.text : ""}` });
    }
    if (b.status === "signed" && b.date && !sent(b, "upsell").length) {
      const left = (Date.parse(b.date + "T12:00:00Z") - now) / DAY;
      const missing = [!hasLine(b, /städ|premium|deluxe/i) && "flyttstäd", !hasLine(b, /pack|deluxe/i) && "packning", !hasLine(b, /kartong/i) && "kartonger"].filter(Boolean);
      if (left >= 4 && left <= 30 && missing.length) out.push({ b, kind: "upsell", channel: "email", score: 18, why: `Flyttar ${b.date} – saknar ${missing.join(", ")}` });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}
/** Kept for the "Följ upp i dag" list: only follow-ups. */
export const closingCandidates = (all: Booking[], now = Date.now()) => salesCandidates(all, now).filter((c) => c.kind === "followup");

export function salesContext(b: Booking, today: string): string {
  const d = b.data;
  const rows = [
    `I dag: ${today}`, `Kund: ${d.name}`, `Ärende ${b.id}${b.version ? " version " + b.version : ""}, status ${b.status}${b.lead === "calc" ? " (räknade pris på hemsidan)" : ""}`,
    d.from || d.to ? `Flytt: ${d.from || "?"} → ${d.to || "?"}${d.distanceKm ? ` (${Math.round(d.distanceKm)} km)` : ""}` : "",
    d.size ? `Tjänst/bostad: ${d.size}${d.areaM2 ? ", " + d.areaM2 + " m²" : ""}` : "",
    b.date ? `Flyttdag: ${b.date}${b.time ? " kl. " + b.time : ""}` : d.date ? `Önskat datum: ${d.date}` : "Inget datum bestämt",
    b.offer ? `Pris efter RUT: ${b.offer.total} kr. Ingår: ${b.offer.lines.map((l) => l.label).join(", ")}` : "",
    b.packages?.length ? `Paket kunden kan välja i offerten: ${b.packages.map((p) => `${p.name} ${p.total} kr`).join(", ")}` : "",
    b.offer?.customerNote ? `Text i offerten: ${b.offer.customerNote}` : "",
    b.discount ? `Har redan fått ${b.discount.pct} % rabatt` : "",
    b.extras?.length ? `Tillval kunden kan välja: ${b.extras.map((e) => `${e.label} ${e.price} kr`).join(", ")}` : "",
    b.sentAt ? `Offerten skickades ${day(b.sentAt)}` : "",
    b.sentAt ? (b.views ? `Kunden har öppnat offerten ${b.views} gång(er), senast ${day(b.lastViewAt)}` : "Kunden har inte öppnat offerten") : "",
    b.reminders?.length ? `${b.reminders.length} automatiska påminnelser skickade` : "",
    b.decline ? `Tackade nej: ${DECLINE_REASONS[b.decline.reason]}${b.decline.text ? " – " + b.decline.text : ""}` : "",
    b.closings?.length ? `Personliga mejl redan skickade: ${b.closings.map((c) => `${day(c.at)} "${c.subject}"`).join("; ")}` : "",
    ...(b.calls || []).slice(-4).map((c) => `Samtal ${day(c.at)}: ${CALL_OUTCOMES[c.outcome]}${c.note ? " – " + c.note : ""}`),
    d.message ? `Kundens meddelande: ${d.message.slice(0, 600)}` : "",
  ];
  return rows.filter(Boolean).join("\n");
}

// What Oskar knows besides the customer's own booking (see lib/agents/playbook.ts): real facts about the company,
// the owner's own sales notes, how full the customer's moving day really is, and e-mails that led to signed bookings.
export type Training = { facts?: string; notes?: string; examples?: WinExample[]; load?: { jobs: number; vehicles: number; nearlyFull: boolean } | null; trust?: string };

export function trainingText(t: Training = {}, kind?: SalesKind): string {
  return [
    SALES_PLAYBOOK, kind ? KIND_PLAYBOOK[kind] : "",
    t.facts ? `FAKTA OM FX FLYTT (det enda du får påstå om priser, tjänster och villkor):\n<foretaget>\n${t.facts}\n</foretaget>` : "",
    t.trust ? `TRYGGHET SOM GÄLLER JUST NU: ${t.trust}` : "",
    t.notes ? `ÄGARENS EGEN SÄLJSTIL (följ den, den går före det allmänna ovan):\n<agarens_stil>\n${t.notes}\n</agarens_stil>` : "",
    t.examples?.length ? `MEJL SOM FAKTISKT LEDDE TILL BOKNING (lär dig av tonen och upplägget – kopiera dem inte, och använd inte deras fakta):\n` +
      t.examples.map((e, i) => `<exempel nr="${i + 1}" signerade_efter_dagar="${e.daysToSign}">\nÄmne: ${e.subject}\n${e.body.slice(0, 1200)}\n</exempel>`).join("\n") : "",
  ].filter(Boolean).join("\n\n");
}
const loadLine = (t: Training) => !t.load ? "" : t.load.nearlyFull
  ? `Kalendern för kundens flyttdag: ${t.load.jobs} jobb bokade, vi har ${t.load.vehicles} bilar – dagen är NÄSTAN FULL (det är sant att säga).`
  : `Kalendern för kundens flyttdag: ${t.load.jobs} jobb bokade av ${t.load.vehicles} bilar – det finns plats (säg INTE att dagen är full).`;

const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["subject", "body", "tip"],
  properties: {
    subject: { type: "string", description: "Kort, personlig ämnesrad på svenska, utan utropstecken och utan ordet 'påminnelse'." },
    body: { type: "string", description: "Mejlet till kunden, 50–110 ord, stycken avskilda med tom rad. En knapp läggs till automatiskt under texten – skriv inte ut någon länk." },
    tip: { type: "string", description: "Ett kort tips till säljaren på kontoret (syns inte för kunden), t.ex. 'Ring i eftermiddag – hon öppnade offerten tre gånger i går'." },
  },
};

export async function draftSales(kind: SalesKind, b: Booking, today: string, o: { hint?: string; name?: string; signature?: string; training?: Training } = {}): Promise<Closing> {
  const t = o.training || {};
  const r = await askJson<Closing>({
    model: MODEL_WRITE, effort: "high", schema: SCHEMA, maxTokens: 12000,
    system: `${HOUSE_RULES}

Du är ${o.name || "Oskar"}, FX Flytts bästa säljare. Du skriver ett mejl till kunden nedan.

${trainingText(t, kind)}

Lova aldrig rabatt eller nytt pris – tycker du att en rabatt skulle hjälpa, skriv det i tipset till säljaren.` +
      (o.signature ? `\nAvsluta mejlet exakt med:\n${o.signature}` : ""),
    user: quote("underlag", [salesContext(b, today), loadLine(t)].filter(Boolean).join("\n")) + (o.hint ? `\n\nSäljarens önskemål om mejlet:\n${quote("instruktion", o.hint.slice(0, 800))}` : ""),
  });
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return { subject: s(r.subject, 140) || `Din flytt med FX Flytt – ${b.id}`, body: s(r.body, 3000), tip: s(r.tip, 400) };
}
/** The old name, used for the follow-up. */
export const draftClosing = (b: Booking, today: string, hint = "", training?: Training) => draftSales("followup", b, today, { hint, training });

// ---------- SMS ----------
const SMS_SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string", description: "SMS-texten, högst 180 tecken, utan länk och utan telefonnummer (de läggs till automatiskt)." } } };
/** A short SMS for a follow-up. The offer link and our phone number are added after the text. */
export async function draftSms(kind: SalesKind, b: Booking, today: string, o: { hint?: string; name?: string; training?: Training } = {}): Promise<string> {
  const t = o.training || {};
  const r = await askJson<{ text: string }>({
    model: MODEL_WRITE, effort: "medium", schema: SMS_SCHEMA, maxTokens: 4000,
    system: `${HOUSE_RULES}\n\n${trainingText({ ...t, examples: [] }, kind)}\n\nDu är ${o.name || "Oskar"}, säljare på FX Flytt. Skriv ett kort, personligt SMS på svenska till kunden (högst 180 tecken, du-form, förnamn, inga emojis).
${kind === "revive" ? "Kunden har inte svarat på offerten på några veckor – fråga vänligt om flytten fortfarande är aktuell." : "Kunden har fått en offert men inte signerat – fråga om något är oklart och säg att det går att signera i mobilen."}
Ingen rabatt, inget nytt pris, ingen press. Skriv inte ut länk eller telefonnummer – de läggs till efter texten. Avsluta inte med hälsning.`,
    user: quote("underlag", [salesContext(b, today), loadLine(t)].filter(Boolean).join("\n")) + (o.hint ? `\n\nSäljarens önskemål:\n${quote("instruktion", o.hint.slice(0, 400))}` : ""),
  });
  return (typeof r.text === "string" ? r.text.trim() : "").replace(/https?:\/\/\S+/g, "").slice(0, 200);
}
export const smsLength = (text: string, link: string) => (text + "\n" + link + "\n").length;
export { SMS_MAX };

// ---------- call script ----------
export type CallScript = { opening: string; questions: string[]; objections: { if: string; say: string }[]; close: string };
const SCRIPT_SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["opening", "questions", "objections", "close"],
  properties: {
    opening: { type: "string", description: "Hur säljaren börjar samtalet, 1–2 meningar, med kundens förnamn." },
    questions: { type: "array", items: { type: "string" }, description: "3 frågor som tar reda på vad kunden behöver för att boka." },
    objections: { type: "array", items: { type: "object", additionalProperties: false, required: ["if", "say"], properties: { if: { type: "string" }, say: { type: "string" } } }, description: "3 troliga invändningar (t.ex. priset, vill jämföra, osäker på datum) och ett bra svar på varje – utan att lova rabatt." },
    close: { type: "string", description: "Hur säljaren avslutar och ber om bokningen." },
  },
};
export async function callScript(b: Booking, today: string, t: Training = {}): Promise<CallScript> {
  const r = await askJson<CallScript>({
    model: MODEL_WRITE, effort: "medium", schema: SCRIPT_SCHEMA, maxTokens: 6000,
    system: `${HOUSE_RULES}\n\n${trainingText({ ...t, examples: [] })}\n\nSkriv ett kort ringmanus på svenska för en säljare på FX Flytt som ska ringa kunden nedan. Naturligt talspråk som går att säga högt, ingen säljjargong. Använd invändningarna och svaren ur träningen, anpassade till just den här kunden.`,
    user: quote("underlag", [salesContext(b, today), loadLine(t)].filter(Boolean).join("\n")),
  });
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    opening: s(r.opening, 400), close: s(r.close, 400),
    questions: (Array.isArray(r.questions) ? r.questions : []).map((q) => s(q, 200)).filter(Boolean).slice(0, 4),
    objections: (Array.isArray(r.objections) ? r.objections : []).map((x) => ({ if: s(x?.if, 160), say: s(x?.say, 400) })).filter((x) => x.if && x.say).slice(0, 4),
  };
}
