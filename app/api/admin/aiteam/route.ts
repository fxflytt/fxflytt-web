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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  const s = await getSettings();
  let plan = await getPlan();
  if (!plan || plan.date !== today() || Date.now() - plan.madeAt > 30 * 6e4) plan = await makePlan();
  const [activity, sent, state] = await Promise.all([listActivity(60), sentToday(), getState()]);
  const team = (Object.keys(AGENTS) as AgentId[]).map((id) => ({ id, name: agentName(s, id), ...AGENTS[id] }));
  return Response.json({ team, auto: s.aiAuto, dailyMax: s.aiDailyMax, sentToday: sent, plan, activity, inbox: { on: s.aiInboxOn, lastSync: state.lastSync, lastError: state.lastError }, report: s.aiReportOn, ai: aiConfigured(), mail: mailConfigured(), sms: smsConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  return Response.json(await makePlan());
}
