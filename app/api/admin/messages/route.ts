// Admin: messages to the crew. GET list (with who has read), POST {text, to: "all" | [ids]}, DELETE ?id=.
import { requireUser } from "@/lib/booking/auth.ts";
import { listMsgs, postMsg, deleteMsg } from "@/lib/booking/messages.ts";
import { listResources } from "@/lib/booking/team.ts";
import { notifyCrew } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  return Response.json({ messages: await listMsgs() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const d = (await req.json().catch(() => ({}))) as { text?: unknown; to?: unknown };
  try {
    const m = await postMsg(d.text, d.to, u.name);
    const people = (await listResources()).filter((r) => r.kind === "person" && r.active && (m.to === "all" || m.to.includes(r.id)));
    await notifyCrew(people.map((r) => r.id), { title: "💬 Meddelande från " + u.name, body: m.text.slice(0, 140), url: "/jobb#meddelanden", tag: "msg-" + m.id });
    return Response.json(m);
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  await deleteMsg(new URL(req.url).searchParams.get("id") || "");
  return Response.json({ ok: true });
}
