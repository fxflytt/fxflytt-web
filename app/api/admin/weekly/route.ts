// Owner: Veckorapporten.
//   GET               → { weeks, report }  (the newest report, or ?week=YYYY-Www)
//   POST              make last week's report now (not e-mailed again if it already was)
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listWeeks, getReport } from "@/lib/agents/weekly.ts";
import { runWeeklyReport } from "@/lib/agents/run.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  const weeks = await listWeeks();
  const w = new URL(req.url).searchParams.get("week") || weeks[0];
  return Response.json({ weeks, report: w ? await getReport(w) : null, ai: aiConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  try { return Response.json(await runWeeklyReport(new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }), false)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 502 }); }
}
