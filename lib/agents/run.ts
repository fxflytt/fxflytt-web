// Glue used by the API routes and the daily job: runs the inbox sync and the weekly report with the real
// mail server, storage and notifications.
import { getSettings } from "../booking/settings.ts";
import { notifyAll } from "../booking/push.ts";
import { listBookings } from "../booking/store.ts";
import { send, mailConfigured, COMPANY_TO } from "../mail/send.ts";
import { syncInbox, listMails, M_CATS, type SyncResult } from "./inbox.ts";
import { listComplaints } from "./complaints.ts";
import { aiConfigured } from "./claude.ts";
import { lastWeek, weekNumbers, analyse, saveReport, getReport, reportEmail, type WeekReport } from "./weekly.ts";

const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function runInboxSync(minGapMs = 0): Promise<SyncResult> {
  const s = await getSettings();
  if (!s.aiInboxOn) return { skipped: "off", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  if (!mailConfigured()) return { skipped: "no-mail", read: 0, saved: 0, complaints: 0, urgent: [], more: false };
  const { fetchNew } = await import("../mail/imap.ts");
  return syncInbox({
    fetchNew, keepDays: s.mailKeepDays, minGapMs,
    notify: async (m) => {
      const complaint = m.category === "klagomal";
      await notifyAll({
        cat: complaint ? "complaint" : "mail",
        title: complaint ? `Klagomål: ${m.fromName || m.from}` : `${M_CATS[m.category]}: ${m.fromName || m.from}`,
        body: m.summary || m.subject, url: complaint && m.complaintId ? "/admin#klagomal" : "/admin#inkorg", tag: m.id,
      });
    },
  });
}

/** Makes (or remakes) the report for last week. `email` sends it to the office. */
export async function runWeeklyReport(today: string, email: boolean): Promise<WeekReport> {
  const s = await getSettings();
  const w = lastWeek(today);
  const [all, complaints, mails] = await Promise.all([listBookings(3000), listComplaints(), listMails(500).catch(() => [])]);
  const numbers = weekNumbers(all, w.from, w.to, w.label, Date.now(), complaints, mails);
  const r: WeekReport = { week: w.label, createdAt: Date.now(), numbers, analysis: null };
  if (aiConfigured()) { try { r.analysis = await analyse(numbers, s.salesGoal); } catch (e) { r.aiError = (e as Error).message.slice(0, 200); } }
  const before = await getReport(w.label);
  if (email && mailConfigured() && !before?.emailedAt) {
    await send(s.aiReportTo || COMPANY_TO, reportEmail(r, `${SITE}/admin#statistik`));
    r.emailedAt = Date.now();
  } else if (before?.emailedAt) r.emailedAt = before.emailedAt;
  await saveReport(r);
  return r;
}
