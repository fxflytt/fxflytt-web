// AI-säljaren – writes a short, personal e-mail that helps a customer decide on an offer that has been sent but not
// signed. It reads what we know (when the offer was sent, whether the customer opened it, reminders, calls, the date)
// and writes in a human way. It never changes the price: if it thinks a discount would help it says so as a tip
// to the office, which uses the Rabatt button as before. Nothing is sent until someone presses Skicka.
import { askJson, MODEL_WRITE, HOUSE_RULES, quote, type JsonSchema } from "./claude.ts";
import { CALL_OUTCOMES, type Booking } from "../booking/store.ts";

export type Closing = { subject: string; body: string; tip: string };

const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["subject", "body", "tip"],
  properties: {
    subject: { type: "string", description: "Kort, personlig ämnesrad på svenska, utan utropstecken och utan 'påminnelse'." },
    body: { type: "string", description: "Mejlet till kunden, 60–140 ord, stycken avskilda med tom rad. Länken till offerten läggs till automatiskt under texten – skriv inte ut någon länk." },
    tip: { type: "string", description: "Ett kort tips till säljaren på kontoret (syns inte för kunden), t.ex. 'Ring i eftermiddag – hon öppnade offerten tre gånger i går'." },
  },
};

const day = (t?: number) => (t ? new Date(t).toLocaleString("sv-SE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Stockholm" }) : "");

export function salesContext(b: Booking, today: string): string {
  const d = b.data;
  const rows = [
    `I dag: ${today}`, `Kund: ${d.name}`, `Offert ${b.id}${b.version ? " version " + b.version : ""}, status ${b.status}`,
    d.from || d.to ? `Flytt: ${d.from || "?"} → ${d.to || "?"}${d.distanceKm ? ` (${Math.round(d.distanceKm)} km)` : ""}` : "",
    d.size ? `Bostad: ${d.size}${d.areaM2 ? ", " + d.areaM2 + " m²" : ""}` : "",
    b.date ? `Flyttdag: ${b.date}${b.time ? " kl. " + b.time : ""}` : d.date ? `Önskat datum: ${d.date}` : "Inget datum bestämt",
    b.offer ? `Pris efter RUT: ${b.offer.total} kr. Ingår: ${b.offer.lines.map((l) => l.label).join(", ")}` : "",
    b.offer?.customerNote ? `Text i offerten: ${b.offer.customerNote}` : "",
    b.discount ? `Har redan fått ${b.discount.pct} % rabatt` : "",
    b.extras?.length ? `Tillval kunden kan välja: ${b.extras.map((e) => e.label).join(", ")}` : "",
    b.sentAt ? `Offerten skickades ${day(b.sentAt)}` : "",
    b.views ? `Kunden har öppnat offerten ${b.views} gång(er), senast ${day(b.lastViewAt)}` : "Kunden har inte öppnat offerten",
    b.reminders?.length ? `${b.reminders.length} automatiska påminnelser skickade` : "",
    b.closings?.length ? `Personliga mejl redan skickade: ${b.closings.map((c) => `${day(c.at)} "${c.subject}"`).join("; ")}` : "",
    ...(b.calls || []).slice(-4).map((c) => `Samtal ${day(c.at)}: ${CALL_OUTCOMES[c.outcome]}${c.note ? " – " + c.note : ""}`),
    d.message ? `Kundens meddelande i förfrågan: ${d.message.slice(0, 600)}` : "",
  ];
  return rows.filter(Boolean).join("\n");
}

export async function draftClosing(b: Booking, today: string, hint = ""): Promise<Closing> {
  const r = await askJson<Closing>({
    model: MODEL_WRITE, effort: "medium", schema: SCHEMA, maxTokens: 6000,
    system: `${HOUSE_RULES}

Du är säljare på FX Flytt. Kunden har fått en offert men inte signerat. Skriv ett kort personligt mejl som hjälper kunden att
bestämma sig och boka: knyt an till kundens egen flytt (datum, sträcka, bostad), lyft fram trygghet (fast pris, försäkrade,
RUT dras direkt), nämn att datum fylls på (bara om flyttdagen är inom 6 veckor) och gör det lätt att svara eller ringa
med frågor. Inget tjat, ingen press, inga utropstecken i rad. Lova aldrig rabatt eller nytt pris – tycker du att en rabatt
skulle hjälpa, skriv det i tipset till säljaren i stället.`,
    user: quote("underlag", salesContext(b, today)) + (hint ? `\n\nSäljarens önskemål om mejlet:\n${quote("instruktion", hint.slice(0, 800))}` : ""),
  });
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  return { subject: s(r.subject, 140) || `Din flytt med FX Flytt – ${b.id}`, body: s(r.body, 3000), tip: s(r.tip, 400) };
}

// Who to push today: open offers that have been sent, ranked like "Chans att vinna" in the admin.
export function closingCandidates(all: Booking[], now = Date.now()) {
  const dayMs = 864e5;
  return all.filter((b) => b.status === "sent" && !b.signedAt && b.data.email && b.token &&
      !(b.sentAt && now - b.sentAt > 21 * dayMs) && !(b.closings?.length && now - b.closings[b.closings.length - 1].at < 3 * dayMs))
    .map((b) => {
      let score = 20;
      if (b.views) score += 25 + Math.min(3, b.views) * 5;
      if (b.lastViewAt && now - b.lastViewAt < 2 * dayMs) score += 15;
      if ((b.calls || []).slice(-1)[0]?.outcome === "callback") score += 10;
      if ((b.calls || []).slice(-1)[0]?.outcome === "notinterested") score -= 40;
      return { b, score };
    }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
}
