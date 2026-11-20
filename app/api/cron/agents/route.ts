// Daily job for the AI team (vercel.json), in the morning:
//   Elsa reads new e-mail in info@ (the admin page also does this every few minutes while it is open)
//   Oskar sends the sales e-mails the owner allowed him to send by himself (within the daily limit)
//   Nils makes today's plan, and on Mondays last week's report (e-mailed to the office)
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { runInboxSync, runSalesAuto, runWeeklyReport, makePlan } from "@/lib/agents/run.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!kvConfigured()) return Response.json({ error: "storage" }, { status: 503 });
  const out: Record<string, unknown> = {};
  try { const r = await runInboxSync(0, 20); out.inbox = { ...r, urgent: r.urgent.length }; } catch (e) { out.inbox = { error: (e as Error).message }; }
  try { out.sales = await runSalesAuto(); } catch (e) { out.sales = { error: (e as Error).message }; }
  try { const p = await makePlan(); out.plan = p.items.length; } catch (e) { out.plan = { error: (e as Error).message }; }
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  if (new Date(today + "T12:00:00Z").getUTCDay() === 1 && (await getSettings()).aiReportOn) {
    try { const r = await runWeeklyReport(today, true); out.report = { week: r.week, emailed: !!r.emailedAt, ai: !!r.analysis }; }
    catch (e) { out.report = { error: (e as Error).message }; }
  }
  return Response.json({ ok: true, ...out });
}
