// Inkorgen – the e-mail assistant. Reads new e-mail in info@ (read-only), lets the AI sort each one
// (quote request, booking question, complaint, invoice …), finds the customer's booking, and writes a draft reply.
// Nothing is sent until someone in the office presses Skicka. Complaints go to Klagomål automatically.
//   fx:m:<id>    one e-mail (expires after Inställningar → AI-teamet → "Spara mejl i", default 180 days)
//   fx:mi        sorted set of ids by date
//   fx:mids      Message-IDs already read (so a message is never handled twice)
//   fx:imap      { uidValidity, lastUid, lastSync, lastError, lastCount }
//   fx:imap:lock while a sync runs
import { randomBytes } from "node:crypto";
import { kv, kvPipe } from "../booking/kv.ts";
import { listBookings, type Booking } from "../booking/store.ts";
import { askJson, MODEL_FAST, MODEL_WRITE, HOUSE_RULES, quote, aiConfigured, type JsonSchema } from "./claude.ts";
import { addComplaint, assess, bookingContext, type Assessment } from "./complaints.ts";
import type { RawMail } from "../mail/imap.ts";
import { dayLoad } from "./playbook.ts";
import { extraCheck, extraText, VOLUMES, type AddItem, type ExtraCheck } from "./volume.ts";
import { estimate as priceEstimate, estimateText, CALC_URL, NO_PRICE, type Estimate, type Service } from "./estimate.ts";

export type MCat = "offert" | "bokning" | "klagomal" | "faktura" | "jobb" | "leverantor" | "spam" | "ovrigt";
export const M_CATS: Record<MCat, string> = {
  offert: "Vill ha offert / pris", bokning: "Fråga om bokning", klagomal: "Klagomål", faktura: "Faktura / betalning",
  jobb: "Söker jobb", leverantor: "Leverantör / reklam", spam: "Skräppost", ovrigt: "Övrigt",
};
export type MStatus = "new" | "answered" | "done";
export type Extracted = { name: string; phone: string; from: string; to: string; date: string; size: string; areaM2?: number; service?: Service; addItems?: AddItem[] };
export type InMail = {
  id: string; uid: number; messageId: string; inReplyTo: string; references: string[];
  from: string; fromName: string; subject: string; date: number; text: string; attachments: string[];
  category: MCat; priority: "high" | "normal" | "low"; summary: string; needsReply: boolean; autoSafe?: boolean; draft: string;
  estimate?: Estimate; autoReplied?: boolean;
  extracted?: Extracted; bookingId?: string; complaintId?: string;
  maybeBookingId?: string; matchNote?: string;   // same e-mail address as a booking, but name/date did not confirm it
  note?: string;                                  // Elsa's internal note to the office (never sent to the customer)
  status: MStatus; answers?: { at: number; by: string; text: string }[]; doneBy?: string;
  aiError?: string;
};
export type ImapState = { uidValidity?: string; lastUid?: number; lastSync?: number; lastError?: string; lastCount?: number };

const K = { m: (id: string) => `fx:m:${id}`, idx: "fx:mi", mids: "fx:mids", state: "fx:imap", lock: "fx:imap:lock" };
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ownAddress = () => (process.env.SMTP_USER || "info@fxflytt.se").toLowerCase();
const BOOKING_ID = /\bFX\d{6}-[0-9A-F]{6}\b/;

export async function getState(): Promise<ImapState> {
  const s = await kv<string | null>(["GET", K.state]);
  return s ? JSON.parse(s) : {};
}
const setState = (s: ImapState) => kv(["SET", K.state, JSON.stringify(s)]);

export async function getMail(id: string): Promise<InMail | null> {
  if (!/^M[0-9a-f]{10}$/.test(id)) return null;
  const s = await kv<string | null>(["GET", K.m(id)]);
  return s ? JSON.parse(s) : null;
}
export async function saveMail(m: InMail, keepDays: number) {
  await kvPipe([["SET", K.m(m.id), JSON.stringify(m), "EX", keepDays * 86400], ["ZADD", K.idx, m.date, m.id]]);
}
export async function listMails(limit = 200): Promise<InMail[]> {
  // Drop ids whose e-mail has expired (kept for "Spara mejl i" days).
  const ids = await kv<string[]>(["ZREVRANGE", K.idx, 0, limit - 1]);
  if (!ids.length) return [];
  const raw = (await kvPipe(ids.map((id) => ["GET", K.m(id)]))) as (string | null)[];
  const gone = ids.filter((_, i) => !raw[i]);
  if (gone.length) await kv(["ZREM", K.idx, ...gone]).catch(() => {});
  return raw.filter((x): x is string => !!x).map((x) => JSON.parse(x) as InMail);
}

// ---------- finding the customer ----------
// A booking is only "sure" when the booking number is in the e-mail, or when the same e-mail address, the name AND the
// moving date all match. Otherwise it is only a possible match: Elsa must not mention anything from it to the sender
// (it may be someone else using the same address), and asks for the booking number instead.
export type Link = { sure: Booking | null; maybe: Booking | null; note: string };
const firstName = (s?: string) => String(s || "").trim().split(/\s+/)[0].toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");

export function linkBooking(m: Pick<RawMail, "from" | "fromName" | "subject" | "text"> & { refs?: RawMail["refs"] }, e: Partial<Extracted> | undefined, all: Booking[]): Link {
  const idm = (m.subject + "\n" + m.text).match(BOOKING_ID);
  if (idm) { const b = all.find((x) => x.id === idm[0]); if (b) return { sure: b, maybe: null, note: `Bokningsnummer ${b.id} står i mejlet.` }; }
  // The customer answers an e-mail we sent about the offer: our offer link (or booking number) is in the quoted part.
  for (const t of m.refs?.tokens || []) { const b = all.find((x) => x.token === t); if (b && (b.data.email || "").toLowerCase() === m.from) return { sure: b, maybe: null, note: "Kunden svarar på vårt mejl om offerten (länken till offerten finns i mejlet)." }; }
  for (const id of m.refs?.ids || []) { const b = all.find((x) => x.id === id); if (b && (b.data.email || "").toLowerCase() === m.from) return { sure: b, maybe: null, note: `Kunden svarar på vårt mejl om ${b.id}.` }; }
  if (!m.from) return { sure: null, maybe: null, note: "" };
  const same = all.filter((b) => (b.data.email || "").toLowerCase() === m.from);
  const b = same.find((x) => !["declined", "cancelled"].includes(x.status)) || same[0];
  if (!b) return { sure: null, maybe: null, note: "" };
  const nameOk = [e?.name, m.fromName].map(firstName).filter(Boolean).includes(firstName(b.data.name));
  const dateOk = !!e?.date && !!b.date && e.date === b.date;
  if (nameOk && dateOk) return { sure: b, maybe: null, note: "Samma e-post, namn och flyttdatum som bokningen." };
  const why = [!nameOk && "namnet", !dateOk && (e?.date ? `datumet (${e.date} i mejlet, ${b.date || "inget"} i bokningen)` : "datumet (står inte i mejlet)")].filter(Boolean).join(" och ");
  return { sure: null, maybe: b, note: `Samma e-postadress som ${b.id} (${b.data.name}${b.date ? ", " + b.date : ""}), men ${why} stämmer inte – inte bekräftad.` };
}
/** @deprecated kept for older callers: the sure booking only. */
export const findBooking = (m: Pick<RawMail, "from" | "subject" | "text"> & { fromName?: string }, all: Booking[]) => linkBooking({ ...m, fromName: m.fromName || "" }, undefined, all).sure;

const daysTo = (date: string, today: string) => Math.round((Date.parse(date + "T12:00:00Z") - Date.parse(today + "T12:00:00Z")) / 864e5);
/** What the reply may say about the customer's booking. */
export function bookingBlock(l: Link, today: string): string {
  if (l.sure) {
    const b = l.sure, d = b.date ? daysTo(b.date, today) : null;
    return [`BOKNINGEN (bekräftad – ${l.note})`, bookingContext(b),
      d != null ? `Dagar kvar till flyttdagen enligt bokningen (räknat av systemet): ${d}. ÄNDRA DATUM är ${d >= 2 ? "KOSTNADSFRITT (2 dagar eller mer kvar)" : d >= 0 ? "belagt med 10 % av bokat pris (mindre än 2 dagar kvar)" : "– flyttdagen har redan varit"}. AVBOKNING är ${d >= 6 ? "KOSTNADSFRI (6 dagar eller mer kvar)" : d >= 0 ? "belagd med 10 % av bokat pris (5 dagar eller mindre kvar)" : "– flyttdagen har redan varit"}. Håll isär ändring och avbokning.` : "Bokningen har inget flyttdatum.",
      b.time ? `Bokad starttid: kl. ${b.time}.` : "Ingen starttid bokad än.",
      "Räkna alltid avgifter från bokningens datum, aldrig från vad kunden skriver. Säger kunden något som inte stämmer med bokningen (t.ex. 'flytten är om 4 dagar' när den är om 27): ta inte ut eller nämn någon avgift – fråga vänligt vilket datum det gäller."].join("\n");
  }
  // The AI never sees the unconfirmed booking's details – then it cannot leak them. The office sees them in the note.
  if (l.maybe) return `INGEN BEKRÄFTAD BOKNING. Avsändarens e-postadress finns på en tidigare bokning, men namn och datum bekräftar inte att mejlet gäller den – det kan vara någon annan.\nNämn INGET ur bokningar i svaret (inget bokningsnummer, datum, ort, pris eller namn). Gäller mejlet en bokad flytt (ändring, avbokning, fråga): be om bokningsnumret (står i bokningsbekräftelsen) och nämn inga avgifter.
Ser mejlet ut att vara ett svar på en offert eller bokning (t.ex. "Re: Din offert", "Din flytt från …", frågor "inför en bokning"): be INTE om boyta, adresser och våning igen som om kunden vore ny – svara på frågorna och säg att vi tittar på kundens offert. Skriv osäkerheten i anteckningen till kontoret.`;
  return "Ingen bokning hittad för avsändaren.";
}

// ---------- the AI's triage ----------
export type Triage = { category: MCat; priority: "high" | "normal" | "low"; summary: string; needsReply: boolean; autoSafe: boolean; draft: string; extracted: Extracted };
const SERVICES: Service[] = ["move", "cleaning", "move_cleaning", "packing", "piano", "office", "abroad", "storage", "other"];
const TRIAGE_SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["category", "priority", "summary", "needsReply", "autoSafe", "extracted"],
  properties: {
    category: { type: "string", enum: Object.keys(M_CATS) },
    priority: { type: "string", enum: ["high", "normal", "low"], description: "high BARA om: flyttdagen är inom 7 dagar från i dag (räkna från dagens datum), klagomål, arg kund, eller något som måste lösas i dag. En vanlig offertförfrågan med flytt längre fram är normal. low = reklam, nyhetsbrev, automatiska mejl." },
    summary: { type: "string", description: "En mening på svenska till kontoret: vem, vad de vill." },
    needsReply: { type: "boolean", description: "false för skräppost, reklam, nyhetsbrev, automatiska kvitton och mejl som bara säger tack." },
    autoSafe: { type: "boolean", description: "true BARA om svaret kan skickas utan att en människa läser det: kunden ställer en enkel fråga som besvaras helt med fakta i <foretaget>, eller vill ha offert och svaret bara tackar och ber om saknade uppgifter. false vid klagomål, pengar, faktura, ändring eller avbokning av en bokning, datum som måste bekräftas, arg kund, eller om du är minsta osäker." },
    extracted: {
      type: "object", additionalProperties: false, required: ["name", "phone", "from", "to", "date", "size", "areaM2", "service", "addItems"],
      description: "Uppgifter för en flyttförfrågan, tom sträng när de inte står i mejlet.",
      properties: {
        name: { type: "string" }, phone: { type: "string" }, from: { type: "string", description: "Adress eller ort man flyttar från" },
        to: { type: "string", description: "Adress eller ort man flyttar till" }, date: { type: "string", description: "Datum som YYYY-MM-DD om det går att avgöra – räkna ut relativa datum ('nästa fredag', 'om 4 dagar') från dagens datum – annars tomt" },
        size: { type: "string", description: "T.ex. '2 rok, 60 m²'" },
        areaM2: { type: "number", description: "Boytan i m² som ett tal (t.ex. 60), eller 0 om den inte står i mejlet. Gissa inte." },
        addItems: { type: "array", description: "Saker kunden vill ha med UTÖVER det offerten/bokningen redan gäller ('jag har 70 kartonger', 'vi tar med en soffa till', 'kan ni ta en tvättmaskin också'). Tom lista om inget. Kartonger kunden vill KÖPA hör inte hit.",
          items: { type: "object", additionalProperties: false, required: ["id", "qty", "label", "m3"], properties: {
            id: { type: "string", enum: [...Object.keys(VOLUMES), "other"], description: "Föremål ur kubikräknaren, eller other" },
            qty: { type: "number" }, label: { type: "string", description: "Vad det är, med kundens ord" },
            m3: { type: "number", description: "Bara för other: uppskattad volym i m³ per styck, annars 0" } } } },
        service: { type: "string", enum: SERVICES, description: "Vad kunden vill ha: move = flytt, cleaning = bara flyttstäd, move_cleaning = flytt + städ, packing, piano (piano/kassaskåp/tunga lyft), office (kontor/företag), abroad (utomlands), storage (magasinering), other." },
      },
    },
  },
};
const TRIAGE_SYSTEM = `${HOUSE_RULES}

Du sorterar inkommande e-post till FX Flytts gemensamma inkorg info@fxflytt.se och plockar ut uppgifterna. Svaret skrivs i nästa steg.`;

export async function triage(m: RawMail, link: Link | Booking | null, today: string, facts = "", name = "Elsa"): Promise<Triage> {
  // The sorting step never sees details of a booking that is not confirmed.
  const l: Link = link && "sure" in link ? link : { sure: (link as Booking | null) || null, maybe: null, note: "" };
  const ctx = l.sure ? bookingContext(l.sure) : l.maybe ? "Avsändarens e-postadress finns på en tidigare bokning, men det är inte bekräftat att mejlet gäller den." : "Ingen bokning hittad för avsändaren.";
  const t = await askJson<Triage>({
    model: MODEL_FAST, effort: "low", schema: TRIAGE_SCHEMA, maxTokens: 4000,
    system: `${TRIAGE_SYSTEM}\nDu heter ${name} och arbetar i kundservice.${facts ? `\n\nFakta om företaget (det enda du får påstå om priser och tjänster):\n<foretaget>\n${facts}\n</foretaget>` : ""}`,
    user: `I dag är det ${today} (${new Date(today + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", timeZone: "UTC" })}).\n${quote("underlag", ctx)}\n\n${quote("mejl", `Från: ${m.fromName} <${m.from}>\nÄmne: ${m.subject}${m.attachments.length ? "\nBilagor: " + m.attachments.join(", ") : ""}\n\n${m.text.slice(0, 8000)}`)}`,
  });
  return cleanTriage(t);
}
export function cleanTriage(t: Partial<Triage>): Triage {
  const e = (t.extracted || {}) as Partial<Extracted>;
  return {
    category: (t.category && t.category in M_CATS ? t.category : "ovrigt") as MCat,
    priority: t.priority === "high" || t.priority === "low" ? t.priority : "normal",
    summary: str(t.summary, 400), needsReply: t.needsReply !== false, autoSafe: t.autoSafe === true, draft: str(t.draft, 4000),
    extracted: {
      name: str(e.name, 120), phone: str(e.phone, 40), from: str(e.from, 200), to: str(e.to, 200),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") ? e.date! : "", size: str(e.size, 80),
      ...(Number(e.areaM2) >= 10 && Number(e.areaM2) <= 400 ? { areaM2: Math.round(Number(e.areaM2)) } : {}),
      ...(e.service && SERVICES.includes(e.service) ? { service: e.service } : {}),
      ...(Array.isArray(e.addItems) && e.addItems.length ? { addItems: e.addItems.slice(0, 20).map((x) => ({ id: str(x?.id, 30), qty: Number(x?.qty) || 1, label: str(x?.label, 80), m3: Number(x?.m3) || 0 })) } : {}),
    },
  };
}

// ---------- the reply ----------
// Written by the strong model with everything Elsa knows: the website (facts + pages), the price engine's numbers,
// what she may say about a booking, and the checklist below (from the owner's review of the first test e-mails).
export const REPLY_RULES = `SÅ SKRIVER DU SVARET
- Svara på VARJE fråga i mejlet. Står svaret i fakta/sidorna: svara. Skriv aldrig att vi "saknar information" om något –
  står det inte i underlaget, skriv att en kollega återkommer om just det.
- Pris: finns PRISFÖRSLAG i underlaget, ge priset ("ca X kr efter RUT") och säg att det är ungefärligt och att exakta priset kommer i offerten.
  Lägg till länken till prisräknaren: ${CALC_URL}. Frågar kunden om paketen: jämför Bas, Premium och Deluxe med priserna i underlaget.
  Piano, kontorsflytt och utlandsflytt: inget pris – säg att de får ett fast pris i en offert.
- För en offert behövs: från- OCH tilladress, datum, boyta (m²), våning och hiss på BÅDA adresserna. Fråga bara efter det som saknas, i en kort lista.
- Relativa datum ("nästa fredag", "om två veckor"): skriv ut datumet själv (t.ex. "fredag 27 november") och be kunden bekräfta – fråga inte "vilket datum?".
- Flyttstäd: fråga efter adressen om den saknas. Fönster och balkong ingår.
- Piano: fråga om det är en flygel eller ett vanligt (upprätt) piano, våning och trappor på båda adresserna, och om pianot får plats i hissen
  (en liten hiss räcker oftast inte – fråga om måtten). Bilder hjälper.
- Kontorsflytt: fråga efter kontorets storlek (m² eller antal arbetsplatser, skåp, arkiv och datorer), våning/hiss och datum.
  Vill de ha faktura till företaget: ja – be om organisationsnummer och fakturaadress. Skriv "Observera att RUT-avdrag gäller privatpersoner, inte företag."
  Större kontor: erbjud att vi kommer och tittar på lokalen kostnadsfritt.
- Utlandsflytt: Norge och Storbritannien ligger utanför EU – tullpapper och en inventarielista behövs, och vi hjälper till med det.
- Skada: visa förståelse, säg att vi är försäkrade hos Trygg-Hansa och att skador som uppstår när vi flyttar ersätts enligt våra villkor.
  Be kunden att inte slänga eller laga det skadade innan vi har sett det, och att svara på det här mejlet med bilder (skriv inte "skicka till info@").
  Erkänn inte skuld och lova inget belopp.
- "Ring mig" utan uppgifter: fråga när det passar att vi ringer, och gärna sträckan och boytan så att samtalet går snabbt.
- Tillägg (kunden vill ha med mer än offerten gäller: kartonger, möbler, vitvaror): följ BESLUT i underlaget. Finns inget beslut,
  lova aldrig att det ingår – säg att vi tittar på hur mycket plats det tar och återkommer om priset påverkas.
- Kan en fråga betyda två saker, förklara kort båda (t.ex. "ingår kartonger – jag behöver 70": vill kunden KÖPA kartonger, eller har kunden
  redan 70 packade kartonger som ska med?). Svara på båda kort och fråga vilket som gäller.
- Frågar kunden om något som kan läggas till (flyttstäd, packning, kartonger): erbjud att lägga till det i offerten – "svara bara på mejlet".
- Lägg det kontoret behöver veta (osäker koppling till bokning, något som måste kollas) i anteckningen till kontoret, inte i svaret.`;

const REPLY_SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["draft", "note"],
  properties: {
    draft: { type: "string", description: "Svaret till kunden, på kundens språk, inklusive hälsningen på samma språk. Tom sträng om inget svar behövs." },
    note: { type: "string", description: "Kort anteckning till kontoret (syns aldrig för kunden), t.ex. osäker bokningskoppling eller något att kontrollera. Tom sträng om inget." },
  },
};
export type ReplyCtx = { link: Link; estimate?: Estimate | null; extra?: ExtraCheck | null; newDay?: string; knowledge?: string; name?: string; today: string; hint?: string };
export async function writeReply(m: Pick<InMail, "from" | "fromName" | "subject" | "text" | "draft" | "extracted">, c: ReplyCtx): Promise<{ draft: string; note: string }> {
  const svc = m.extracted?.service;
  const price = c.estimate ? `PRISFÖRSLAG (räknat med prismotorn, samma som prisräknaren på hemsidan):\n${estimateText(c.estimate)}` :
    svc && NO_PRICE.includes(svc) ? "Inget prisförslag: piano, kontor och utlandsflytt prissätts i en offert." : "Inget prisförslag (boytan saknas) – fråga efter boytan om kunden vill ha pris.";
  const r = await askJson<{ draft: string; note: string }>({
    model: MODEL_WRITE, effort: "medium", schema: REPLY_SCHEMA, maxTokens: 8000,
    system: `${HOUSE_RULES}\n\nDu är ${c.name || "Elsa"} i kundservice på FX Flytt och skriver ett svar på ett mejl till info@. Kontoret läser svaret innan det skickas.\n\n${REPLY_RULES}` +
      (c.knowledge ? `\n\nFAKTA OM FX FLYTT (det enda du får påstå om priser, tjänster och villkor):\n<foretaget>\n${c.knowledge}\n</foretaget>` : ""),
    user: `I dag är det ${c.today} (${new Date(c.today + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", timeZone: "UTC" })}).\n` +
      quote("underlag", `${bookingBlock(c.link, c.today)}\n\n${price}${c.extra ? `\n\n${extraText(c.extra)}` : ""}${c.newDay ? `\n\n${c.newDay}` : ""}`) + `\n\n${quote("mejl", `Från: ${m.fromName} <${m.from}>\nÄmne: ${m.subject}\n\n${m.text.slice(0, 8000)}`)}` +
      (m.draft && c.hint ? `\n\nTidigare utkast:\n${quote("utkast", m.draft)}` : "") +
      (c.hint ? `\n\nKontorets instruktion för svaret (följ den, men lova inget utöver den):\n${quote("instruktion", c.hint.slice(0, 1000))}` : ""),
  });
  return { draft: str(r.draft, 4000), note: str(r.note, 600) };
}
/** @deprecated: the office's "Skriv om" now uses writeReply. */
export async function redraft(m: InMail, b: Booking | null, hint: string, today: string, o: { fast?: boolean; facts?: string } = {}): Promise<string> {
  return (await writeReply(m, { link: { sure: b, maybe: null, note: "" }, estimate: m.estimate, knowledge: o.facts, today, hint })).draft;
}

// ---------- sync ----------
export type SyncResult = { skipped?: string; read: number; saved: number; complaints: number; urgent: InMail[]; more: boolean; error?: string };

/**
 * Reads new e-mail and sorts it. Safe to call often: only one sync runs at a time, and `minGapMs` skips a call
 * that comes soon after the last one (the admin page asks every few minutes while it is open).
 */
export async function syncInbox(o: {
  fetchNew: typeof import("../mail/imap.ts").fetchNew; keepDays: number; minGapMs?: number; max?: number;
  notify?: (m: InMail) => Promise<void>;
  facts?: string; knowledge?: string; prices?: unknown; vehicles?: number; names?: { elsa: string; maja: string };
  // Runs after an e-mail is sorted and saved (make a request, answer by itself …). Changes to the mail are saved after it.
  after?: (m: InMail, ctx: { booking: Booking | null; complaint: import("./complaints.ts").Complaint | null }) => Promise<void>;
}): Promise<SyncResult> {
  const res: SyncResult = { read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  const st = await getState();
  if (o.minGapMs && st.lastSync && Date.now() - st.lastSync < o.minGapMs) return { ...res, skipped: "recent" };
  if (!(await kv(["SET", K.lock, "1", "NX", "EX", 280]))) return { ...res, skipped: "running" };
  try {
    const got = await o.fetchNew(st.uidValidity ? st : null, o.max ?? 10);
    res.read = got.mails.length; res.more = got.more;
    const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    const all = got.mails.length ? await listBookings(2000) : [];
    const own = ownAddress();
    // Sort up to three e-mails at the same time.
    const queue = [...got.mails];
    const worker = async () => {
      for (let m = queue.shift(); m; m = queue.shift()) {
        // Copies of what the website itself sends to info@ (new requests etc.) are already in the admin.
        if (m.from === own || /mailer-daemon|postmaster/i.test(m.from)) continue;
        if (m.messageId && !(await kv<number>(["SADD", K.mids, m.messageId]))) continue;
        try { await handle(m); }
        catch (e) {
          // Never lose an e-mail: keep it unsorted, so the office still sees it.
          const fallback: InMail = { id: "M" + randomBytes(5).toString("hex"), uid: m.uid, messageId: m.messageId, inReplyTo: m.inReplyTo, references: m.references.slice(-10),
            from: m.from, fromName: m.fromName, subject: m.subject, date: m.date, text: m.text, attachments: m.attachments,
            category: "ovrigt", priority: "normal", summary: "", needsReply: true, draft: "", status: "new", aiError: (e as Error).message.slice(0, 200) };
          await saveMail(fallback, o.keepDays).catch(() => {}); res.saved++;
        }
      }
    };
    const handle = async (m: RawMail) => {
      {
        // 1) sort and pick out the details (fast model) 2) decide which booking it is, if any 3) price it
        // 4) write the reply (strong model) – or, for a complaint, let Maja assess it and write the reply.
        const first = linkBooking(m, undefined, all);
        let t: Triage | null = null, aiError = "";
        if (aiConfigured()) { try { t = await triage(m, first, today, o.facts, o.names?.elsa); } catch (e) { aiError = (e as Error).message.slice(0, 200); } }
        const link = t ? linkBooking(m, t.extracted, all) : first;
        const b = link.sure;
        const est = t && o.prices && !b ? priceEstimate(t.extracted, o.prices, m.text) : null;
        const extra = b && t?.extracted.addItems?.length ? extraCheck(b, t.extracted.addItems, (o.prices as { truckM3?: number } | undefined)?.truckM3 || 20) : null;
        // The customer asks for another day: is it free in the calendar? (a full day → the office confirms it)
        const nd = b && t?.extracted.date && b.date && t.extracted.date !== b.date ? t.extracted.date : "";
        const nl = nd ? dayLoad(all, nd, o.vehicles ?? 1) : null;
        const newDay = nd && nl ? `NYTT DATUM SOM KUNDEN VILL HA: ${nd} – ${nl.jobs} jobb bokade av ${nl.vehicles} bilar: ${nl.nearlyFull ? "dagen är NÄSTAN FULL – säg att kontoret bekräftar den nya dagen" : "det finns plats – säg att det går bra och att kontoret bekräftar (kostnad enligt ÄNDRA DATUM ovan)"}.` : "";
        const mail: InMail = {
          id: "M" + randomBytes(5).toString("hex"), uid: m.uid, messageId: m.messageId, inReplyTo: m.inReplyTo, references: m.references.slice(-10),
          from: m.from, fromName: m.fromName, subject: m.subject, date: m.date, text: m.text, attachments: m.attachments,
          ...(t || { category: "ovrigt", priority: "normal", summary: "", needsReply: true, autoSafe: false } as Omit<Triage, "extracted" | "draft">), draft: "",
          ...(t && Object.values(t.extracted).some(Boolean) ? { extracted: t.extracted } : { extracted: undefined }),
          ...(b ? { bookingId: b.id } : {}), ...(link.maybe ? { maybeBookingId: link.maybe.id, matchNote: link.note } : {}),
          ...(est ? { estimate: est } : {}),
          status: t && !t.needsReply ? "done" : "new", ...(aiError ? { aiError } : {}),
        };
        // A reply that depends on an unconfirmed booking is never sent without a person reading it.
        if (link.maybe) mail.autoSafe = false;
        if (mail.category === "spam") mail.status = "done";
        let complaint: import("./complaints.ts").Complaint | null = null;
        if (mail.category === "klagomal") {
          let a: Assessment | null = null;
          try { if (aiConfigured()) a = await assess(m.text, m.subject, b, o.knowledge); } catch { /* the office can press "Bedöm med AI" later */ }
          const c = await addComplaint({ source: "email", name: m.fromName || b?.data.name, email: m.from, phone: b?.data.phone, bookingId: b?.id, mailId: mail.id,
            subject: m.subject, text: m.text, assessment: a, by: `${o.names?.maja || "Maja"} (AI)` });
          complaint = c;
          mail.complaintId = c.id; mail.status = "new"; res.complaints++;
          if (a?.draft) mail.draft = a.draft;
          if (a?.severity === "high") mail.priority = "high";
        } else if (t && mail.status === "new" && aiConfigured()) {
          try { const r = await writeReply(mail, { link, estimate: est, extra, newDay, knowledge: o.knowledge, name: o.names?.elsa, today }); mail.draft = r.draft; if (r.note) mail.note = r.note; }
          catch (e) { mail.aiError = "Kunde inte skriva svaret: " + (e as Error).message.slice(0, 160); }
          if (extra && !extra.free) mail.note = [mail.note, `Tillägg ca ${String(extra.add).replace(".", ",")} m³ (${extra.lines.join("; ")}). ${extra.reason} Kontrollera om priset ska ändras.`].filter(Boolean).join(" · ");
        }
        if (link.maybe && !mail.note) mail.note = link.note;
        await saveMail(mail, o.keepDays); res.saved++;
        if (o.after) { try { await o.after(mail, { booking: b, complaint }); await saveMail(mail, o.keepDays); } catch (e) { console.error("inbox after", (e as Error).message); } }
        if (mail.status === "new" && (mail.priority === "high" || mail.category === "offert" || mail.category === "klagomal")) res.urgent.push(mail);
      }
    };
    await Promise.all([worker(), worker(), worker()]);
    await kv(["EXPIRE", K.mids, 400 * 86400]);
    await setState({ uidValidity: got.uidValidity, lastUid: got.lastUid, lastSync: Date.now(), lastError: "", lastCount: res.saved });
    if (o.notify) for (const m of res.urgent) await o.notify(m).catch(() => {});
    return res;
  } catch (e) {
    const msg = (e as Error).message || "fel";
    await setState({ ...st, lastSync: Date.now(), lastError: msg.slice(0, 200) });
    return { ...res, error: msg };
  } finally {
    await kv(["DEL", K.lock]).catch(() => {});
  }
}

// Subject for a reply: "Re: …" once.
const NO_SUBJECT = /^\(?(ingen rubrik|no subject|inget ämne)\)?$/i;
export const hasSubject = (s: string) => !!s.trim() && !NO_SUBJECT.test(s.trim());
/** Subject for a reply: "Re: …" once. An e-mail without subject gets a real one ("Din flytt Kungsör–Arboga – FX Flytt"). */
export function replySubject(s: string, m?: Pick<InMail, "extracted" | "category">): string {
  if (!hasSubject(s)) {
    const e = m?.extracted, town = (x: string) => x.split(",").pop()!.replace(/\d/g, "").trim();
    if (e?.from && e?.to) return `Din flytt ${town(e.from)}–${town(e.to)} – FX Flytt`;
    return m?.category === "offert" ? "Din offertförfrågan – FX Flytt" : "Svar från FX Flytt";
  }
  return /^(re|sv|aw):/i.test(s.trim()) ? s.trim() : "Re: " + s.trim();
}
/** A readable title in the admin for an e-mail without subject. */
export const mailTitle = (m: Pick<InMail, "subject" | "summary">) => (hasSubject(m.subject) ? m.subject : m.summary.slice(0, 80) || "(ingen rubrik)");

// The reply as e-mail: plain and personal (no big banner), with the customer's own words quoted below.
export function replyEmail(m: InMail, text: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const when = new Date(m.date).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Stockholm" });
  const quoted = m.text.slice(0, 4000);
  const subject = replySubject(m.subject, m);
  const html = `<!DOCTYPE html><html lang="sv"><body style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#14212b">
${text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
<p style="margin:18px 0 0;color:#5b6b78;font-size:13px">FX Flytt AB · 076-300 07 23 · <a href="https://www.fxflytt.se" style="color:#0d2a3f">www.fxflytt.se</a></p>
<div style="margin-top:22px;padding-left:12px;border-left:3px solid #e3e8ed;color:#5b6b78;font-size:13px">Den ${esc(when)} skrev ${esc(m.fromName || m.from)}:<br>${esc(quoted).replace(/\n/g, "<br>")}</div>
</body></html>`;
  const plain = `${text}\n\nFX Flytt AB · 076-300 07 23 · www.fxflytt.se\n\nDen ${when} skrev ${m.fromName || m.from}:\n${quoted.split("\n").map((l) => "> " + l).join("\n")}`;
  return { subject, html, text: plain };
}
