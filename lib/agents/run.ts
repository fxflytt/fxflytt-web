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
import { estimate } from "./estimate.ts";
import { salesCandidates, draftSales, SALES_KINDS, type SalesKind } from "./sales.ts";
import { dailyPlan, type DayPlan } from "./plan.ts";
import { AGENTS, agentName, aiBy, aiSignature, logActivity, takeQuota } from "./team.ts";
import { kv } from "../booking/kv.ts";
import { lastWeek, weekNumbers, analyse, saveReport, getReport, reportEmail, type WeekReport } from "./weekly.ts";

const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/ | /g, " ") + " kr";
const saveSent = async (raw: string) => { try { const { saveToSent } = await import("../mail/imap.ts"); await saveToSent(raw); } catch { /* best effort */ } };

// ---------- Elsa (and Maja's receipt) ----------
export async function runInboxSync(minGapMs = 0): Promise<SyncResult> {
  const s = await getSettings();
  if (!s.aiInboxOn) return { skipped: "off", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  if (!mailConfigured()) return { skipped: "no-mail", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  const { fetchNew } = await import("../mail/imap.ts");
  const prices = await getPrices();
  const elsa = agentName(s, "elsa"), maja = agentName(s, "maja");
  return syncInbox({
    fetchNew, keepDays: s.mailKeepDays, minGapMs, facts: companyFacts(prices), names: { elsa, maja },
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
    const est = estimate(m.extracted, prices);
    if (est) {
      m.estimate = est;
      // The draft tells the customer the approximate price (from the same engine as the website).
      try {
        m.draft = await redraft(m, null, `Ge ett ungefärligt pris efter RUT: Bas (bara flytt) ${kr(est.bas!)}${est.premium ? `, Premium (flytt + flyttstäd) ${kr(est.premium)}` : ""}, räknat på ${est.m2} m² och ca ${est.km} km mellan ${est.from} och ${est.to}. Säg att exakt pris kommer i offerten när vi har adresserna, och be om det som saknas.`, today(), { fast: true, facts: companyFacts(prices as never) });
      } catch { /* keep the first draft */ }
    }
    if (s.aiAuto.request) {
      const e = m.extracted;
      const b = await createBooking("admin", {
        name: e?.name || m.fromName || m.from, phone: e?.phone || "", email: m.from, from: e?.from || "", to: e?.to || "",
        date: e?.date || "", size: e?.size || "", areaM2: est ? String(est.m2) : "", distanceKm: est?.km,
        message: `Från e-post (${new Date(m.date).toLocaleDateString("sv-SE")}): ${m.subject}\n\n${m.text.slice(0, 2500)}`,
      }, {
        ...(est ? { offer: { total: est.bas!, lines: est.lines || [], note: `Prisförslag från ${elsa} (AI): ${est.from}–${est.to} ca ${est.km} km, ${est.m2} m². Kontrollera adresserna innan offerten skickas.` } } : {}),
        history: [{ at: Date.now(), what: `Skapad av ${aiBy(s, "elsa")} från e-post${est ? ` med prisförslag ${kr(est.bas!)}` : ""}` }],
      });
      m.bookingId = b.id;
      await logActivity({ agent: "elsa", what: `Gjorde en förfrågan av mejlet från ${b.data.name}${est ? ` – prisförslag ${kr(est.bas!)}` : ""}`, bookingId: b.id, mailId: m.id, auto: true });
    }
  }
  // Simple questions: Elsa answers by herself (only if the owner allowed it, and only what the AI marked as safe).
  if (s.aiAuto.reply && m.autoSafe && m.draft && m.status === "new" && ["offert", "bokning", "ovrigt"].includes(m.category) && m.priority !== "high"
      && !/no-?reply|mailer-daemon|notifications?@/i.test(m.from) && mailConfigured() && await takeQuota(s.aiDailyMax)) {
    const text = m.draft.replace(/\n*Vänliga hälsningar[\s\S]*$/i, "").trim() + "\n\n" + aiSignature(elsa, AGENTS.elsa.role);
    try {
      await saveSent(await send(m.from, replyEmail(m, text), undefined, { inReplyTo: m.messageId || undefined, references: m.references, fromName: `${elsa} · FX Flytt` }));
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
      const text = `Hej ${(c.name || "").split(" ")[0] || ""}!\n\nTack för att du hörde av dig. Vi har tagit emot ditt ärende och tar det på allvar. En kollega går igenom det och du får svar senast ${when}.\n\nHar du bilder eller annat som visar vad som hänt får du gärna svara på det här mejlet med dem.\n\n${aiSignature(maja, AGENTS.maja.role)}`;
      try {
        await saveSent(await send(c.email, replyEmail(m, text), undefined, { inReplyTo: m.messageId || undefined, references: m.references, fromName: `${maja} · FX Flytt` }));
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
export async function sendSales(kind: SalesKind, b: Booking, subject: string, body: string, by: string, auto = false) {
  const l = salesLink(kind, b);
  await send(b.data.email!, personalOfferEmail(b, subject, body, l.url, l.label, l.badge), COMPANY_TO, { fromName: "FX Flytt" });
  b.closings = [...(b.closings || []), { at: Date.now(), subject, by, kind, ...(auto ? { auto: true } : {}) }].slice(-12);
  await saveBooking(b, `${SALES_KINDS[kind].label}: mejl skickat "${subject}"${auto ? " (automatiskt)" : ""}`, by);
}

/** Oskar sends the e-mails the owner allowed him to send by himself, best chance first, within the daily limit. */
export async function runSalesAuto(): Promise<{ sent: string[]; failed: string[] }> {
  const s = await getSettings(), out = { sent: [] as string[], failed: [] as string[] };
  const kinds = (Object.keys(SALES_KINDS) as SalesKind[]).filter((k) => s.aiAuto[k]);
  if (!kinds.length || !aiConfigured() || !mailConfigured()) return out;
  const oskar = agentName(s, "oskar");
  const list = salesCandidates(await listBookings(2000)).filter((c) => kinds.includes(c.kind)).slice(0, 12);
  for (const c of list) {
    if (!(await takeQuota(s.aiDailyMax))) break;
    try {
      const d = await draftSales(c.kind, c.b, today(), { name: oskar, signature: aiSignature(oskar, AGENTS.oskar.role) });
      await sendSales(c.kind, c.b, d.subject, d.body, aiBy(s, "oskar"), true);
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
