// Admin: the AI team overview – names, what they may do by themselves, today's plan (Nils) and what they have done.
//   GET            → { team, auto, dailyMax, sentToday, plan, activity, counts, ai, mail }
//   POST ?plan=1   make today's plan again
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { mailConfigured } from "@/lib/mail/send.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { AGENTS, agentName, listActivity, sentToday, type AgentId } from "@/lib/agents/team.ts";
import { getPlan, makePlan } from "@/lib/agents/run.ts";
import { getState } from "@/lib/agents/inbox.ts";
import { smsConfigured } from "@/lib/sms/send.ts";
import { kv } from "@/lib/booking/kv.ts";
import { getPrices } from "@/lib/pricing/current.ts";
import { runScenarios } from "@/lib/agents/scenarios.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  if (new URL(req.url).searchParams.get("scenarios")) {
    const v = await kv<string | null>(["GET", "fx:scen"]);
    return Response.json(v ? JSON.parse(v) : { at: 0, results: [] });
  }
  const s = await getSettings();
  let plan = await getPlan();
  if (!plan || plan.date !== today() || Date.now() - plan.madeAt > 30 * 6e4) plan = await makePlan();
  const [activity, sent, state] = await Promise.all([listActivity(60), sentToday(), getState()]);
  const team = (Object.keys(AGENTS) as AgentId[]).map((id) => ({ id, name: agentName(s, id), ...AGENTS[id] }));
  return Response.json({ team, auto: s.aiAuto, autopilot: s.aiAutopilot !== false, owner: u.role === "owner", dailyMax: s.aiDailyMax, sentToday: sent, plan, activity, inbox: { on: s.aiInboxOn, lastSync: state.lastSync, lastError: state.lastError }, report: s.aiReportOn, ai: aiConfigured(), mail: mailConfigured(), sms: smsConfigured(), test: s.aiTestMode ? { to: s.aiTestTo || "info@fxflytt.se", phone: s.aiTestPhone } : null });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  // "Testa Elsa": the owner's scenarios through the real reply step. Nothing is sent. Owner only (it costs a few kronor).
  if (new URL(req.url).searchParams.get("scenarios")) {
    if (u.role !== "owner") return Response.json({ error: "Bara ägaren kan köra provet." }, { status: 403 });
    if (!aiConfigured()) return Response.json({ error: "AI är inte inställt (ANTHROPIC_API_KEY)." }, { status: 503 });
    const ids = ((await req.json().catch(() => ({}))) as { ids?: unknown }).ids;
    const results = await runScenarios(await getPrices(), Array.isArray(ids) ? ids.filter((x): x is string => typeof x === "string") : undefined, agentName(await getSettings(), "elsa"));
    const out = { at: Date.now(), by: u.name, results };
    await kv(["SET", "fx:scen", JSON.stringify(out)]);
    return Response.json(out);
  }
  return Response.json(await makePlan());
}
