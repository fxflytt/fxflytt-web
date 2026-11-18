// Owner: "Varför vi förlorar" (Nils).
//   GET               → { report } the latest analysis
//   POST {days}       count again (30–365 days) and let the AI explain it
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listBookings } from "@/lib/booking/store.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { lostNumbers, analyseLost, saveLost, getLost, type LostReport } from "@/lib/agents/lost.ts";
import { logActivity } from "@/lib/agents/team.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  return Response.json({ report: await getLost(), ai: aiConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  const d = (await req.json().catch(() => ({}))) as { days?: unknown };
  const days = Math.min(365, Math.max(30, Math.round(Number(d.days) || 90)));
  const numbers = lostNumbers(await listBookings(3000), days);
  const r: LostReport = { createdAt: Date.now(), numbers, analysis: null };
  if (aiConfigured() && numbers.lost) { try { r.analysis = await analyseLost(numbers); } catch (e) { r.aiError = (e as Error).message.slice(0, 200); } }
  await saveLost(r);
  await logActivity({ agent: "nils", what: `Analyserade varför vi förlorade ${numbers.lost} av ${numbers.won + numbers.lost} affärer (${days} dagar)` });
  return Response.json({ report: r });
}
