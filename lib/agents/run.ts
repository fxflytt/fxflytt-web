// Runs the AI team with the real mail server, storage and notifications. Used by the API routes and the daily job.
//   Elsa  – inbox: sort, find the booking, make a request with a price suggestion, answer simple questions (if allowed)
//   Maja  – complaints: confirm at once that the complaint has arrived (if allowed)
//   Oskar – sales e-mails by himself (each kind only if allowed), within the daily limit
//   Nils  – today's plan and the weekly report
import { getSettings, type Settings } from "../booking/settings.ts";
import { notifyAll } from "../booking/push.ts";
import { listBookings, createBooking, saveBooking, getBooking, type Booking } from "../booking/store.ts";
import { send, mailConfigured, COMPANY_TO } from "../mail/send.ts";
import { personalOfferEmail } from "../mail/bookingEmail.ts";
import { getPrices } from "../pricing/current.ts";
import { companyFacts } from "../assistant/facts.ts";
import { syncInbox, listMails, redraft, replyEmail, M_CATS, type InMail, type SyncResult } from "./inbox.ts";
import { listComplaints, updateComplaint, type Complaint } from "./complaints.ts";
import { aiConfigured } from "./claude.ts";
import { estimateNote } from "./estimate.ts";
import { knowledge } from "./knowledge.ts";
import { salesCandidates, draftSales, draftSms, SALES_KINDS, type SalesKind, type Training } from "./sales.ts";
import { teamMail, teamSms } from "./outbox.ts";
import { winningExamples, dayLoad, skillsText, townProof } from "./playbook.ts";
import { listResources } from "../booking/team.ts";
import { sendSms, smsConfigured, smsFooter } from "../sms/send.ts";
import { dailyPlan, type DayPlan } from "./plan.ts";
import { AGENTS, agentName, aiBy, aiSignature, replyLang, textLang, logActivity, takeQuota } from "./team.ts";
import { kv } from "../booking/kv.ts";
import { lastWeek, weekNumbers, analyse, saveReport, getReport, reportEmail, type WeekReport } from "./weekly.ts";

const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/ | /g, " ") + " kr";
const saveSent = async (raw: string) => { try { const { saveToSent } = await import("../mail/imap.ts"); await saveToSent(raw); } catch { /* best effort */ } };

// ---------- Elsa (and Maja's receipt) ----------
/**
 * Reads new e-mail. `rounds` > 1 (the morning job) keeps going until the inbox is empty or about 3½ minutes have passed,
 * so a night's e-mail is all sorted in the morning – not only the first 10.
 */
export async function runInboxSync(minGapMs = 0, rounds = 1): Promise<SyncResult> {
  const t0 = Date.now();
  let r = await syncOnce(minGapMs);
  for (let i = 1; i < rounds && r.more && !r.error && !r.skipped && Date.now() - t0 < 210_000; i++) {
    const n = await syncOnce(0);
    r = { ...n, read: r.read + n.read, saved: r.saved + n.saved, complaints: r.complaints + n.complaints, urgent: [...r.urgent, ...n.urgent] };
  }
  return r;
}
async function syncOnce(minGapMs = 0): Promise<SyncResult> {
  const s = await getSettings();
  if (!s.aiInboxOn) return { skipped: "off", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  if (!mailConfigured()) return { skipped: "no-mail", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  const { fetchNew } = await import("../mail/imap.ts");
  const prices = await getPrices();
  const elsa = agentName(s, "elsa"), maja = agentName(s, "maja");
  return syncInbox({
    fetchNew, keepDays: s.mailKeepDays, minGapMs, facts: companyFacts(prices), knowledge: knowledge(prices), prices, names: { elsa, maja },
    after: (m, ctx) => afterMail(m, ctx, s, prices),
    notify: async (m) => {
      const complaint = m.category === "klagomal";
      await notifyAll({
        cat: complaint ? "complaint" : m.category === "offert" ? "new" : "mail",
        title: complaint ? `${maja}: klagomål från ${m.fromName || m.from}` : `${elsa}: ${M_CATS[m.category].toLowerCase()} – ${m.fromName || m.from}`,
        body: m.summary || m.subject, url: complaint ? "/admin#klagomal" : m.bookingId ? "/admin#" + m.bookingId : "/admin#inkorg", tag: m.id,
      });
    },
  });
}

async function afterMail(m: InMail, ctx: { booking: Booking | null; complaint: Complaint | null }, s: Settings, prices: unknown) {
  const elsa = agentName(s, "elsa");
  await logActivity({ agent: "elsa", what: `Läste mejl från ${m.fromName || m.from}: ${M_CATS[m.category].toLowerCase()}${m.summary ? " – " + m.summary : ""}`, mailId: m.id, bookingId: m.bookingId });
  // A quote request from someone who is not a customer yet → a request in Offerter, with a price suggestion when possible.
  if (m.category === "offert" && !m.bookingId && m.status === "new") {
    const est = m.estimate;
    if (s.aiAuto.request) {
      const e = m.extracted;
      const b = await createBooking("admin", {
        name: e?.name || m.fromName || m.from, phone: e?.phone || "", email: m.from, from: e?.from || "", to: e?.to || "",
        date: e?.date || "", size: e?.size || "", areaM2: est ? String(est.m2) : "", distanceKm: est?.km ?? undefined,
        message: `Från e-post (${new Date(m.date).toLocaleDateString("sv-SE")}): ${m.subject}\n\n${m.text.slice(0, 2500)}`,
      }, {
        ...(est ? { offer: { total: (est.bas ?? est.cleaning)!, lines: est.lines || [], note: `Prisförslag från ${elsa} (AI): ${estimateNote(est)}. Kontrollera adresserna innan offerten skickas.` } } : {}),
        history: [{ at: Date.now(), what: `Skapad av ${aiBy(s, "elsa")} från e-post${est ? ` med prisförslag ${kr((est.bas ?? est.cleaning)!)}` : ""}` }],
      });
      m.bookingId = b.id;
      await logActivity({ agent: "elsa", what: `Gjorde en förfrågan av mejlet från ${b.data.name}${est ? ` – prisförslag ${kr((est.bas ?? est.cleaning)!)}` : ""}`, bookingId: b.id, mailId: m.id, auto: true });
    }
  }
  // Simple questions: Elsa answers by herself (only if the owner allowed it, and only what the AI marked as safe).
  if (s.aiAuto.reply && m.autoSafe && m.draft && m.status === "new" && ["offert", "bokning", "ovrigt"].includes(m.category) && m.priority !== "high"
      && !/no-?reply|mailer-daemon|notifications?@/i.test(m.from) && mailConfigured() && await takeQuota(s.aiDailyMax)) {
    const text = m.draft.replace(/\n*(Vänliga hälsningar|Med vänliga hälsningar|Best regards|Kind regards)[\s\S]*$/i, "").trim() + "\n\n" + aiSignature(elsa, AGENTS.elsa.role, replyLang(m.draft));
    try {
      const o = await teamMail(m.from, replyEmail(m, text), undefined, { inReplyTo: m.messageId || undefined, references: m.references, fromName: `${elsa} · FX Flytt` }, s);
      if (o.test) {
        // Test mode: the reply went to the office – the e-mail stays in "Att svara" so a person still answers the customer.
        m.note = `TESTLÄGE: ${elsa} skulle ha svarat själv – svaret gick till ${s.aiTestTo || COMPANY_TO}, inte till kunden.`;
        await logActivity({ agent: "elsa", what: `TEST: svar till ${m.fromName || m.from} gick till kontoret`, mailId: m.id, auto: true });
        return;
      }
      await saveSent(o.raw);
      m.answers = [{ at: Date.now(), by: aiBy(s, "elsa"), text }]; m.status = "answered"; m.autoReplied = true; m.draft = "";
      if (m.bookingId) { const b = await getBooking(m.bookingId); if (b) await saveBooking(b, `${aiBy(s, "elsa")} svarade på e-post: "${m.subject.slice(0, 60)}"`); }
      await logActivity({ agent: "elsa", what: `Svarade ${m.fromName || m.from} själv: "${m.subject.slice(0, 60)}"`, mailId: m.id, bookingId: m.bookingId, auto: true });
    } catch (e) { m.aiError = "Kunde inte skicka svaret: " + (e as Error).message.slice(0, 120); }
  }
  // Maja: a receipt to the customer at once – no promises, just that we have it and when we answer.
  const c = ctx.complaint;
  if (c) {
    await logActivity({ agent: "maja", what: `Tog emot klagomål från ${c.name || c.email} – allvar ${c.severity === "high" ? "hög" : c.severity === "low" ? "låg" : "medel"}`, complaintId: c.id, bookingId: c.bookingId });
    if (s.aiAuto.ack && c.email && mailConfigured() && await takeQuota(s.aiDailyMax)) {
      const maja = agentName(s, "maja");
      const when = new Date(c.deadline + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
      const en = textLang(m.text) === "en", first = (c.name || "").split(" ")[0] || "";
      const whenEn = new Date(c.deadline + "T12:00:00Z").toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
      const text = en
        ? `Hi ${first},\n\nThank you for getting in touch. We have received your message and take it seriously. A colleague is looking into it, and you will hear from us no later than ${whenEn}.\n\nIf you have photos or anything else that shows what happened, just reply to this e-mail with them.\n\n${aiSignature(maja, AGENTS.maja.role, "en")}`
        : `Hej ${first}!\n\nTack för att du hörde av dig. Vi har tagit emot ditt ärende och tar det på allvar. En kollega går igenom det och du får svar senast ${when}.\n\nHar du bilder eller annat som visar vad som hänt får du gärna svara på det här mejlet med dem.\n\n${aiSignature(maja, AGENTS.maja.role)}`;
      try {
        const o = await teamMail(c.email, replyEmail(m, text), undefined, { inReplyTo: m.messageId || undefined, references: m.references, fromName: `${maja} · FX Flytt` }, s);
        if (o.test) { await updateComplaint(c.id, () => `TESTLÄGE: ${maja}s bekräftelse gick till kontoret, inte till kunden`, aiBy(s, "maja")); return; }
        await saveSent(o.raw);
        await updateComplaint(c.id, () => `${aiBy(s, "maja")} bekräftade att klagomålet kommit in (svar senast ${c.deadline})`, aiBy(s, "maja"));
        await logActivity({ agent: "maja", what: `Bekräftade till ${c.name || c.email} att klagomålet kommit in`, complaintId: c.id, auto: true });
      } catch { /* the office answers anyway */ }
    }
  }
}

// ---------- Oskar ----------
export function salesLink(kind: SalesKind, b: Booking): { url: string; label: string; badge: string } {
  if ((kind === "followup" || kind === "revive" || kind === "winback") && b.token) return { url: `${SITE}/signera?t=${b.token}`, label: kind === "winback" ? "Se din offert" : "Se och signera offerten", badge: "DIN OFFERT" };
  if (kind === "upsell") return { url: `mailto:info@fxflytt.se?subject=${encodeURIComponent("Lägg till i min flytt " + b.id)}`, label: "Lägg till i min flytt", badge: "DIN FLYTT" };
  return { url: `${SITE}/#offert`, label: "Få en offert", badge: "FX FLYTT" };
}
export async function sendSales(kind: SalesKind, b: Booking, subject: string, body: string, by: string, auto = false, skills: string[] = []) {
  const l = salesLink(kind, b);
  const test = (await teamMail(b.data.email!, personalOfferEmail(b, subject, body, l.url, l.label, l.badge), COMPANY_TO, { fromName: "FX Flytt" })).test;
  if (test) { await saveBooking(b, `TESTLÄGE: säljmejlet "${subject}" gick till kontoret, inte till kunden`, by); return; }
  b.closings = [...(b.closings || []), { at: Date.now(), subject, by, kind, body: body.slice(0, 2000), ...(skills.length ? { skills } : {}), ...(auto ? { auto: true } : {}) }].slice(-12);
  await saveBooking(b, `${SALES_KINDS[kind].label}: mejl skickat "${subject}"${auto ? " (automatiskt)" : ""}`, by);
}

/** Everything Oskar knows besides the booking itself: facts, the owner's sales notes, the calendar, e-mails that worked. */
export async function salesTraining(b: Booking, kind: SalesKind | "", ctx?: { all?: Booking[]; vehicles?: number; s?: Settings; facts?: string }): Promise<Training> {
  const s = ctx?.s || await getSettings();
  const all = ctx?.all || await listBookings(2000);
  const vehicles = ctx?.vehicles ?? (await listResources().catch(() => [])).filter((r) => r.kind === "vehicle" && (r as { active?: boolean }).active !== false).length;
  const trust = [s.insured ? `Vi är försäkrade${s.insurer ? " (" + s.insurer + ")" : ""}` : "", s.fskatt ? "Godkänd för F-skatt" : "", s.orgNr ? "Org.nr " + s.orgNr : ""].filter(Boolean).join(". ");
  const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();
  const proof = townProof(all, town(b.data.from)) || townProof(all, town(b.data.to));
  return { facts: ctx?.facts || companyFacts(await getPrices()), notes: s.aiSalesNotes, examples: kind ? winningExamples(all, kind) : [], load: dayLoad(all, b.date, vehicles), trust,
    skills: skillsText(kind || undefined, all), proof };
}

/** An SMS about the offer: the text, the link to the offer, and our phone number. */
export async function sendSalesSms(kind: SalesKind, b: Booking, text: string, by: string, auto = false) {
  const link = (kind === "followup" || kind === "revive") && b.token ? `${SITE}/signera?t=${b.token}` : "";
  const msg = [text.trim(), link, smsFooter].filter(Boolean).join("\n");
  if ((await teamSms(b.data.phone, msg)).test) { await saveBooking(b, `TESTLÄGE: SMS:et gick inte till kunden: "${text.slice(0, 80)}"`, by); return; }
  b.sms = [...(b.sms || []), { at: Date.now(), by, text: msg, ...(auto ? { auto: true } : {}) }].slice(-20);
  b.closings = [...(b.closings || []), { at: Date.now(), subject: "SMS: " + text.slice(0, 60), by, kind, sms: true, ...(auto ? { auto: true } : {}) }].slice(-12);
  await saveBooking(b, `${SALES_KINDS[kind].label}: SMS skickat${auto ? " (automatiskt)" : ""}: "${text.slice(0, 80)}"`, by);
}

/** Oskar sends the e-mails the owner allowed him to send by himself, best chance first, within the daily limit. */
export async function runSalesAuto(): Promise<{ sent: string[]; failed: string[] }> {
  const s = await getSettings(), out = { sent: [] as string[], failed: [] as string[] };
  const kinds = (Object.keys(SALES_KINDS) as SalesKind[]).filter((k) => s.aiAuto[k]);
  if (!kinds.length || !aiConfigured() || !mailConfigured()) return out;
  const oskar = agentName(s, "oskar");
  const smsOk = s.aiAuto.sms && smsConfigured();
  const all = await listBookings(2000), facts = companyFacts(await getPrices());
  const vehicles = (await listResources().catch(() => [])).filter((r) => r.kind === "vehicle" && (r as { active?: boolean }).active !== false).length;
  const list = salesCandidates(all).filter((c) => kinds.includes(c.kind) && (c.channel === "email" || smsOk)).slice(0, 12);
  for (const c of list) {
    if (!(await takeQuota(s.aiDailyMax))) break;
    try {
      if (c.channel === "sms") {
        const text = await draftSms(c.kind, c.b, today(), { name: oskar, training: await salesTraining(c.b, c.kind, { all, vehicles, s, facts }) });
        await sendSalesSms(c.kind, c.b, text, aiBy(s, "oskar"), true);
        await logActivity({ agent: "oskar", what: `${SALES_KINDS[c.kind].label}: SMS till ${c.b.data.name}: "${text.slice(0, 80)}"`, bookingId: c.b.id, auto: true });
        out.sent.push(c.b.id); continue;
      }
      const d = await draftSales(c.kind, c.b, today(), { name: oskar, signature: aiSignature(oskar, AGENTS.oskar.role), training: await salesTraining(c.b, c.kind, { all, vehicles, s, facts }) });
      await sendSales(c.kind, c.b, d.subject, d.body, aiBy(s, "oskar"), true, d.skills);
      await logActivity({ agent: "oskar", what: `${SALES_KINDS[c.kind].label}: skickade "${d.subject}" till ${c.b.data.name}${d.tip ? " · Tips: " + d.tip : ""}`, bookingId: c.b.id, auto: true });
      out.sent.push(c.b.id);
    } catch (e) { out.failed.push(`${c.b.id}: ${(e as Error).message}`); }
  }
  return out;
}

// ---------- Nils ----------
export async function makePlan(): Promise<DayPlan> {
  const [all, complaints, mails] = await Promise.all([listBookings(2000), listComplaints(), listMails(300).catch(() => [])]);
  const p = dailyPlan(all, complaints, mails, salesCandidates(all), today());
  await kv(["SET", "fx:aiplan", JSON.stringify(p)]);
  return p;
}
export async function getPlan(): Promise<DayPlan | null> {
  const s = await kv<string | null>(["GET", "fx:aiplan"]);
  return s ? JSON.parse(s) : null;
}

/** Makes (or remakes) the report for last week. `email` sends it to the office. */
export async function runWeeklyReport(day: string, email: boolean): Promise<WeekReport> {
  const s = await getSettings();
  const w = lastWeek(day);
  const [all, complaints, mails] = await Promise.all([listBookings(3000), listComplaints(), listMails(500).catch(() => [])]);
  const numbers = weekNumbers(all, w.from, w.to, w.label, Date.now(), complaints, mails);
  const r: WeekReport = { week: w.label, createdAt: Date.now(), numbers, analysis: null };
  if (aiConfigured()) { try { r.analysis = await analyse(numbers, s.salesGoal); } catch (e) { r.aiError = (e as Error).message.slice(0, 200); } }
  const before = await getReport(w.label);
  if (email && mailConfigured() && !before?.emailedAt) {
    await send(s.aiReportTo || COMPANY_TO, reportEmail(r, `${SITE}/admin#rapporter`));
    r.emailedAt = Date.now();
  } else if (before?.emailedAt) r.emailedAt = before.emailedAt;
  await saveReport(r);
  await logActivity({ agent: "nils", what: `Skrev veckorapporten för vecka ${w.label.split("-W")[1]}${r.emailedAt && !before?.emailedAt ? " och mejlade den" : ""}` });
  return r;
}
