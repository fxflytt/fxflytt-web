// Admin: time clock stamps.
//   GET ?now=1          who is clocked in right now (all admin users)
//   GET ?month=YYYY-MM  every stamp that month (owner)
//   POST                add or correct a stamp {id?, month?, rid, in, out} (owner) – logged on the stamp
//   DELETE ?month&id    remove a stamp (owner)
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listResources } from "@/lib/booking/team.ts";
import { shiftsOf, openShift, saveShift, deleteShift } from "@/lib/booking/clock.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, status = 400) => Response.json({ error: e }, { status });

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const u = await requireUser(req, q.get("now") ? undefined : "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  if (q.get("now")) {
    const people = (await listResources()).filter((r) => r.kind === "person" && r.active);
    const open = await Promise.all(people.map(async (r) => { const s = await openShift(r.id); return s ? { rid: r.id, name: r.name, in: s.in } : null; }));
    return Response.json({ open: open.filter(Boolean) });
  }
  const month = q.get("month") || "";
  if (!/^\d{4}-\d{2}$/.test(month)) return err("Ogiltig månad.");
  return Response.json({ shifts: await shiftsOf(month) });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const r = (await listResources()).find((x) => x.id === d.rid && x.kind === "person");
  if (!r) return err("Välj en person.");
  try { return Response.json(await saveShift({ ...d, rid: r.id, name: r.name }, u.name)); }
  catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  try { await deleteShift(q.get("month") || "", q.get("id") || ""); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
