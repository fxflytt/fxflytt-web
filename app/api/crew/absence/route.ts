// Crew app: my absences. GET list, POST {kind, from, to, note}, DELETE ?id= (withdraw).
import { crewUser } from "@/lib/booking/crew.ts";
import { listAbsences, addAbsence, withdraw, ABS_KINDS } from "@/lib/booking/absence.ts";
import { listBookings } from "@/lib/booking/store.ts";
import { notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });

export async function GET(req: Request) {
  const me = await crewUser(req); if (!me) return err("unauthorized", 401);
  const since = new Date(Date.now() - 30 * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  return Response.json({ absences: (await listAbsences()).filter((a) => a.rid === me.id && a.to >= since).sort((a, b) => b.from.localeCompare(a.from)) });
}

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return err("unauthorized", 401);
  try {
    const a = await addAbsence(me, (await req.json().catch(() => ({}))) as Record<string, unknown>, me.name);
    // Jobs the person is on during the absence – the office needs to know.
    const jobs = (await listBookings()).filter((b) => b.status === "signed" && b.date && b.date >= a.from && b.date <= a.to && (b.crew || []).includes(me.id));
    const span = a.from === a.to ? fmt(a.from) : `${fmt(a.from)}–${fmt(a.to)}`;
    await notifyAll({ cat: "crew",
      title: a.kind === "sick" ? `🤒 ${me.name} är sjuk` : a.kind === "vacation" ? `${me.name} ansöker om ledigt` : `${me.name} kan inte jobba`,
      body: span + (jobs.length ? ` · står på ${jobs.length} jobb` : "") + (a.note ? " · " + a.note : ""), url: "/admin#franvaro", tag: "abs-" + a.id,
    });
    return Response.json({ ok: true, absence: a, jobs: jobs.length, label: ABS_KINDS[a.kind] });
  } catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const me = await crewUser(req); if (!me) return err("unauthorized", 401);
  try { await withdraw(new URL(req.url).searchParams.get("id") || "", me.id); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
