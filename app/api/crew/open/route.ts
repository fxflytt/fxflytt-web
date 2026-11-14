// Crew app: answer "Vem kan jobba?" – POST {id, answer: "yes"|"no"}.
import { crewUser } from "@/lib/booking/crew.ts";
import { answer } from "@/lib/booking/opencall.ts";
import { listBookings } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { listAbsences } from "@/lib/booking/absence.ts";
import { notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const d = (await req.json().catch(() => ({}))) as { id?: unknown; answer?: unknown };
  try {
    const r = await answer(String(d.id || ""), me, d.answer === "yes", await listResources(), () => listBookings(), await listAbsences());
    if (r.took) await notifyAll({ title: `✋ ${me.name} tog jobbet`, body: `${r.b.data.name} · ${r.b.date}${r.b.time ? " kl. " + r.b.time : ""}` + (r.full ? " · alla platser tillsatta" : ""), url: "/admin#" + r.b.id, tag: "oc-" + r.b.id });
    return Response.json({ ok: true, took: r.took });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 409 }); }
}
