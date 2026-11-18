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

export type MCat = "offert" | "bokning" | "klagomal" | "faktura" | "jobb" | "leverantor" | "spam" | "ovrigt";
export const M_CATS: Record<MCat, string> = {
  offert: "Vill ha offert / pris", bokning: "Fråga om bokning", klagomal: "Klagomål", faktura: "Faktura / betalning",
  jobb: "Söker jobb", leverantor: "Leverantör / reklam", spam: "Skräppost", ovrigt: "Övrigt",
};
export type MStatus = "new" | "answered" | "done";
export type Extracted = { name: string; phone: string; from: string; to: string; date: string; size: string };
export type InMail = {
  id: string; uid: number; messageId: string; inReplyTo: string; references: string[];
  from: string; fromName: string; subject: string; date: number; text: string; attachments: string[];
  category: MCat; priority: "high" | "normal" | "low"; summary: string; needsReply: boolean; draft: string;
  extracted?: Extracted; bookingId?: string; complaintId?: string;
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
export function findBooking(m: Pick<RawMail, "from" | "subject" | "text">, all: Booking[]): Booking | null {
  const idm = (m.subject + "\n" + m.text).match(BOOKING_ID);
  if (idm) { const b = all.find((x) => x.id === idm[0]); if (b) return b; }
  if (!m.from) return null;
  const same = all.filter((b) => (b.data.email || "").toLowerCase() === m.from);
  // The newest booking that is still alive, otherwise the newest one.
  return same.find((b) => !["declined", "cancelled"].includes(b.status)) || same[0] || null;
}

// ---------- the AI's triage ----------
export type Triage = { category: MCat; priority: "high" | "normal" | "low"; summary: string; needsReply: boolean; draft: string; extracted: Extracted };
const TRIAGE_SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["category", "priority", "summary", "needsReply", "draft", "extracted"],
  properties: {
    category: { type: "string", enum: Object.keys(M_CATS) },
    priority: { type: "string", enum: ["high", "normal", "low"], description: "high = kund som vill boka snart, flyttar inom 7 dagar, klagomål eller något brådskande. low = reklam, nyhetsbrev, automatiska mejl." },
    summary: { type: "string", description: "En mening på svenska till kontoret: vem, vad de vill." },
    needsReply: { type: "boolean", description: "false för skräppost, reklam, nyhetsbrev, automatiska kvitton och mejl som bara säger tack." },
    draft: { type: "string", description: "Utkast till svar till avsändaren, eller tom sträng om inget svar behövs. Vid offertförfrågan: tacka, bekräfta det kunden skrivit och be om det som saknas för en offert (från- och tilladress, datum, bostadens storlek, våningar/hiss, telefonnummer). Hitta aldrig på pris." },
    extracted: {
      type: "object", additionalProperties: false, required: ["name", "phone", "from", "to", "date", "size"],
      description: "Uppgifter för en flyttförfrågan, tom sträng när de inte står i mejlet.",
      properties: {
        name: { type: "string" }, phone: { type: "string" }, from: { type: "string", description: "Adress eller ort man flyttar från" },
        to: { type: "string", description: "Adress eller ort man flyttar till" }, date: { type: "string", description: "Flyttdatum som YYYY-MM-DD om det går att avgöra, annars tomt" },
        size: { type: "string", description: "T.ex. '2 rok, 60 m²'" },
      },
    },
  },
};
const TRIAGE_SYSTEM = `${HOUSE_RULES}

Du sorterar inkommande e-post till FX Flytts gemensamma inkorg info@fxflytt.se och skriver ett utkast till svar.
Kontoret granskar alltid utkastet innan något skickas.`;

export async function triage(m: RawMail, b: Booking | null, today: string): Promise<Triage> {
  const t = await askJson<Triage>({
    model: MODEL_FAST, effort: "low", schema: TRIAGE_SCHEMA, maxTokens: 4000, system: TRIAGE_SYSTEM,
    user: `I dag är det ${today}.\n${quote("underlag", bookingContext(b))}\n\n${quote("mejl", `Från: ${m.fromName} <${m.from}>\nÄmne: ${m.subject}${m.attachments.length ? "\nBilagor: " + m.attachments.join(", ") : ""}\n\n${m.text.slice(0, 8000)}`)}`,
  });
  return cleanTriage(t);
}
export function cleanTriage(t: Partial<Triage>): Triage {
  const e = (t.extracted || {}) as Partial<Extracted>;
  return {
    category: (t.category && t.category in M_CATS ? t.category : "ovrigt") as MCat,
    priority: t.priority === "high" || t.priority === "low" ? t.priority : "normal",
    summary: str(t.summary, 400), needsReply: t.needsReply !== false, draft: str(t.draft, 4000),
    extracted: {
      name: str(e.name, 120), phone: str(e.phone, 40), from: str(e.from, 200), to: str(e.to, 200),
      date: /^\d{4}-\d{2}-\d{2}$/.test(e.date || "") ? e.date! : "", size: str(e.size, 80),
    },
  };
}

// A better reply from the stronger model, optionally following the office's own words ("säg att vi kan tisdag").
const REDRAFT_SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["draft"], properties: { draft: { type: "string" } } };
export async function redraft(m: InMail, b: Booking | null, hint: string, today: string): Promise<string> {
  const r = await askJson<{ draft: string }>({
    model: MODEL_WRITE, effort: "medium", schema: REDRAFT_SCHEMA, maxTokens: 6000,
    system: `${HOUSE_RULES}\n\nSkriv ett svar på kundens mejl som kontoret kan skicka efter granskning.`,
    user: `I dag är det ${today}.\n${quote("underlag", bookingContext(b))}\n\n${quote("mejl", `Från: ${m.fromName} <${m.from}>\nÄmne: ${m.subject}\n\n${m.text.slice(0, 8000)}`)}` +
      (m.draft ? `\n\nTidigare utkast:\n${quote("utkast", m.draft)}` : "") +
      (hint ? `\n\nKontorets instruktion för svaret (följ den, men lova inget utöver den):\n${quote("instruktion", hint.slice(0, 1000))}` : ""),
  });
  return str(r.draft, 4000);
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
        const b = findBooking(m, all);
        let t: Triage | null = null, aiError = "";
        if (aiConfigured()) { try { t = await triage(m, b, today); } catch (e) { aiError = (e as Error).message.slice(0, 200); } }
        const mail: InMail = {
          id: "M" + randomBytes(5).toString("hex"), uid: m.uid, messageId: m.messageId, inReplyTo: m.inReplyTo, references: m.references.slice(-10),
          from: m.from, fromName: m.fromName, subject: m.subject, date: m.date, text: m.text, attachments: m.attachments,
          ...(t || { category: "ovrigt", priority: "normal", summary: "", needsReply: true, draft: "" } as Omit<Triage, "extracted">),
          ...(t && Object.values(t.extracted).some(Boolean) ? { extracted: t.extracted } : { extracted: undefined }),
          ...(b ? { bookingId: b.id } : {}), status: t && !t.needsReply ? "done" : "new", ...(aiError ? { aiError } : {}),
        };
        if (mail.category === "spam") mail.status = "done";
        if (mail.category === "klagomal") {
          let a: Assessment | null = null;
          try { if (aiConfigured()) a = await assess(m.text, m.subject, b); } catch { /* the office can press "Bedöm med AI" later */ }
          const c = await addComplaint({ source: "email", name: m.fromName || b?.data.name, email: m.from, phone: b?.data.phone, bookingId: b?.id, mailId: mail.id,
            subject: m.subject, text: m.text, assessment: a, by: "AI-inkorgen" });
          mail.complaintId = c.id; mail.status = "new"; res.complaints++;
          if (a?.draft) mail.draft = a.draft;
          if (a?.severity === "high") mail.priority = "high";
        }
        await saveMail(mail, o.keepDays); res.saved++;
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
export const replySubject = (s: string) => (/^(re|sv|aw):/i.test(s.trim()) ? s.trim() : "Re: " + s.trim());

// The reply as e-mail: plain and personal (no big banner), with the customer's own words quoted below.
export function replyEmail(m: InMail, text: string) {
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
  const when = new Date(m.date).toLocaleString("sv-SE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Stockholm" });
  const quoted = m.text.slice(0, 4000);
  const subject = replySubject(m.subject);
  const html = `<!DOCTYPE html><html lang="sv"><body style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#14212b">
${text.split(/\n{2,}/).map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}
<p style="margin:18px 0 0;color:#5b6b78;font-size:13px">FX Flytt AB · 076-300 07 23 · <a href="https://www.fxflytt.se" style="color:#0d2a3f">www.fxflytt.se</a></p>
<div style="margin-top:22px;padding-left:12px;border-left:3px solid #e3e8ed;color:#5b6b78;font-size:13px">Den ${esc(when)} skrev ${esc(m.fromName || m.from)}:<br>${esc(quoted).replace(/\n/g, "<br>")}</div>
</body></html>`;
  const plain = `${text}\n\nFX Flytt AB · 076-300 07 23 · www.fxflytt.se\n\nDen ${when} skrev ${m.fromName || m.from}:\n${quoted.split("\n").map((l) => "> " + l).join("\n")}`;
  return { subject, html, text: plain };
}
