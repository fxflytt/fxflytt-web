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
export type Candidate = { b: Booking; kind: SalesKind; score: number; why: string };

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
    if (!b.data.email || b.nextId || lastCall(b) === "notinterested") continue;
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
          out.push({ b, kind: "followup", score, why: b.views ? `Öppnade offerten ${b.views} gång${b.views > 1 ? "er" : ""}, senast ${day(b.lastViewAt)}` : "Har inte öppnat offerten" });
        }
      } else if (age <= 45 * DAY && !sent(b, "revive").length) {
        out.push({ b, kind: "revive", score: 15 + (b.views ? 10 : 0), why: `Skickad ${day(b.sentAt)}, inget svar` });
      }
    }
    if (b.noMarketing) continue;
    if (b.lead === "calc" && b.status === "new" && now - b.createdAt >= DAY && now - b.createdAt <= 10 * DAY && !sent(b, "calc").length)
      out.push({ b, kind: "calc", score: 25, why: `Räknade pris ${day(b.createdAt)}${b.offer ? ` (${b.offer.total} kr)` : ""}` });
    if (b.status === "declined" && b.declinedAt && now - b.declinedAt >= 2 * DAY && now - b.declinedAt <= 21 * DAY && future(b) && !sent(b, "winback").length) {
      const r = (b.decline?.reason || "other") as DeclineReason;
      if (r !== "no_move" && !/^Ersatt av version/.test(b.decline?.text || ""))
        out.push({ b, kind: "winback", score: r === "price" ? 22 : 15, why: `Tackade nej: ${DECLINE_REASONS[r]}${b.decline?.text ? " – " + b.decline.text : ""}` });
    }
    if (b.status === "signed" && b.date && !sent(b, "upsell").length) {
      const left = (Date.parse(b.date + "T12:00:00Z") - now) / DAY;
      const missing = [!hasLine(b, /städ|premium|deluxe/i) && "flyttstäd", !hasLine(b, /pack|deluxe/i) && "packning", !hasLine(b, /kartong/i) && "kartonger"].filter(Boolean);
      if (left >= 4 && left <= 30 && missing.length) out.push({ b, kind: "upsell", score: 18, why: `Flyttar ${b.date} – saknar ${missing.join(", ")}` });
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

const KIND_TEXT: Record<SalesKind, string> = {
  followup: `Kunden har fått en offert men inte signerat. Hjälp kunden att bestämma sig: knyt an till kundens egen flytt (datum, sträcka, bostad),
lyft fram trygghet (fast pris, försäkrade, RUT dras direkt), nämn att datum fylls på (bara om flyttdagen är inom 6 veckor) och gör det lätt att
svara eller ringa med frågor. Har kunden öppnat offerten flera gånger: fråga vänligt om något är oklart.`,
  revive: `Kunden fick en offert för några veckor sedan och har inte svarat. Skriv ett kort, avslappnat mejl: fråga om flytten fortfarande är aktuell,
om datumet har ändrats, och erbjud att uppdatera offerten. Inget tjat – det här är sista mejlet om offerten.`,
  calc: `Kunden räknade fram ett pris i prisräknaren på hemsidan och fick det på mejl, men har inte bett om en offert. Tacka för intresset,
påminn om priset (efter RUT) och vad som ingår, och berätta att en offert är gratis och kan signeras i mobilen. Be kunden svara med datum och adresser,
eller fylla i formuläret via knappen.`,
  winback: `Kunden tackade nej till offerten. Skriv ett respektfullt mejl som tackar för svaret och, utifrån skälet, erbjuder ett alternativ:
vid pris – Bas-paketet (bara flytt) eller att kunden packar själv; vid datum – att vi gärna hittar ett annat datum; vid annan flyttfirma –
önska lycka till och säg att vi finns om planerna ändras. Max ett försök, ingen press. Lova inget nytt pris.`,
  upsell: `Kunden har bokat flytten. Skriv ett kort, hjälpsamt mejl som bekräftar att allt är klart och erbjuder det som saknas i bokningen:
flyttstäd (fast pris, städgaranti), packning eller flyttkartonger. Sälj med omtanke ("slipp städa själv sista dagen"). Kunden kan svara på mejlet
eller ringa för att lägga till. Nämn inga priser som inte står i underlaget.`,
};
const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["subject", "body", "tip"],
  properties: {
    subject: { type: "string", description: "Kort, personlig ämnesrad på svenska, utan utropstecken och utan ordet 'påminnelse'." },
    body: { type: "string", description: "Mejlet till kunden, 60–140 ord, stycken avskilda med tom rad. En knapp läggs till automatiskt under texten – skriv inte ut någon länk." },
    tip: { type: "string", description: "Ett kort tips till säljaren på kontoret (syns inte för kunden), t.ex. 'Ring i eftermiddag – hon öppnade offerten tre gånger i går'." },
  },
};

export async function draftSales(kind: SalesKind, b: Booking, today: string, o: { hint?: string; name?: string; signature?: string } = {}): Promise<Closing> {
  const r = await askJson<Closing>({
    model: MODEL_WRITE, effort: "medium", schema: SCHEMA, maxTokens: 6000,
    system: `${HOUSE_RULES}

Du är ${o.name || "Oskar"}, säljare på FX Flytt. ${KIND_TEXT[kind]}
Inget tjat, ingen press, inga utropstecken i rad. Lova aldrig rabatt eller nytt pris – tycker du att en rabatt skulle hjälpa, skriv det i tipset till säljaren.` +
      (o.signature ? `\nAvsluta mejlet exakt med:\n${o.signature}` : ""),
    user: quote("underlag", salesContext(b, today)) + (o.hint ? `\n\nSäljarens önskemål om mejlet:\n${quote("instruktion", o.hint.slice(0, 800))}` : ""),
  });
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return { subject: s(r.subject, 140) || `Din flytt med FX Flytt – ${b.id}`, body: s(r.body, 3000), tip: s(r.tip, 400) };
}
/** The old name, used for the follow-up. */
export const draftClosing = (b: Booking, today: string, hint = "") => draftSales("followup", b, today, { hint });

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
export async function callScript(b: Booking, today: string): Promise<CallScript> {
  const r = await askJson<CallScript>({
    model: MODEL_WRITE, effort: "low", schema: SCRIPT_SCHEMA, maxTokens: 4000,
    system: `${HOUSE_RULES}\n\nSkriv ett kort ringmanus på svenska för en säljare på FX Flytt som ska ringa kunden nedan. Naturligt talspråk, ingen säljjargong.`,
    user: quote("underlag", salesContext(b, today)),
  });
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return {
    opening: s(r.opening, 400), close: s(r.close, 400),
    questions: (Array.isArray(r.questions) ? r.questions : []).map((q) => s(q, 200)).filter(Boolean).slice(0, 4),
    objections: (Array.isArray(r.objections) ? r.objections : []).map((x) => ({ if: s(x?.if, 160), say: s(x?.say, 400) })).filter((x) => x.if && x.say).slice(0, 4),
  };
}
