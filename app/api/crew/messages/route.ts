// Crew app: messages from the office. GET {messages}, POST {ids} marks them read.
import { crewUser } from "@/lib/booking/crew.ts";
import { listMsgs, isFor, markRead } from "@/lib/booking/messages.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const l = (await listMsgs()).filter((m) => isFor(m, me.id) && m.at >= (me.appAt || 0) - 30 * 864e5).slice(0, 50);
  return Response.json({ messages: l.map((m) => ({ id: m.id, text: m.text, from: m.from, at: m.at, read: !!m.read[me.id] })) });
}

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const d = (await req.json().catch(() => ({}))) as { ids?: unknown };
  const ids = Array.isArray(d.ids) ? d.ids.filter((x): x is string => typeof x === "string").slice(0, 100) : [];
  return Response.json({ ok: true, marked: await markRead(ids, me.id) });
}
