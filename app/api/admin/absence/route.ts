// Admin: absences of the crew. GET list; POST {rid, kind, from, to, note} registers one for a person;
// POST ?id=&do=approve|reject decides a request; DELETE ?id= removes one. The person gets a notification.
import { requireUser } from "@/lib/booking/auth.ts";
import { listAbsences, addAbsence, decide, withdraw } from "@/lib/booking/absence.ts";
import { listResources } from "@/lib/booking/team.ts";
import { notifyCrew } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const fmt = (d: string) => new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  return Response.json({ absences: await listAbsences() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams, what = q.get("do");
  try {
    if (what === "approve" || what === "reject") {
      const a = await decide(q.get("id") || "", what === "approve", u.name);
      await notifyCrew([a.rid], { title: what === "approve" ? "✅ Din ledighet är godkänd" : "Din ledighet blev inte godkänd", body: (a.from === a.to ? fmt(a.from) : `${fmt(a.from)}–${fmt(a.to)}`) + " · ring kontoret om du har frågor", url: "/jobb", tag: "abs-" + a.id });
      return Response.json(a);
    }
    const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const r = (await listResources()).find((x) => x.id === d.rid && x.kind === "person");
    if (!r) return err("Välj en person.");
    return Response.json(await addAbsence(r, d, u.name, true));
  } catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  try { await withdraw(new URL(req.url).searchParams.get("id") || "", null); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
