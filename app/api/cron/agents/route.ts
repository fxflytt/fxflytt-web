// Daily job for the AI team (vercel.json): reads new e-mail in info@ (the admin page also does this every few minutes
// while it is open), and on Mondays makes last week's sales report and e-mails it to the office.
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { runInboxSync, runWeeklyReport } from "@/lib/agents/run.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!kvConfigured()) return Response.json({ error: "storage" }, { status: 503 });
  const out: Record<string, unknown> = {};
  try { const r = await runInboxSync(); out.inbox = { ...r, urgent: r.urgent.length }; } catch (e) { out.inbox = { error: (e as Error).message }; }
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const monday = new Date(today + "T12:00:00Z").getUTCDay() === 1;
  if (monday && (await getSettings()).aiReportOn) {
    try { const r = await runWeeklyReport(today, true); out.report = { week: r.week, emailed: !!r.emailedAt, ai: !!r.analysis }; }
    catch (e) { out.report = { error: (e as Error).message }; }
  }
  return Response.json({ ok: true, ...out });
}
