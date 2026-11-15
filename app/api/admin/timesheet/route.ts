// Admin (owner): Tidrapporter – check and approve each person's working day.
//   GET ?from=YYYY-MM-DD&to=YYYY-MM-DD   → { rows, rule }
//   POST { items: [{ rid, date, start, end, breakMin, note? }] }   approve (or re-approve with a correction)
//   DELETE ?rid=&date=                   undo an approval
import { requireUser } from "@/lib/booking/auth.ts";
import { listBookings } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { shiftsOf } from "@/lib/booking/clock.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { buildRows, approvedBetween, approve, unapprove, addDay } from "@/lib/booking/timesheet.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams, from = q.get("from") || "", to = q.get("to") || "";
  if (!DATE.test(from) || !DATE.test(to) || to < from || addDay(from, 62) < to) return err("Ogiltig period.");
  const months = new Set<string>(); for (let d = from; d <= to; d = addDay(d)) months.add(d.slice(0, 7));
  const [all, res, shifts, approved, s] = await Promise.all([listBookings(), listResources(), Promise.all([...months].map(shiftsOf)).then((x) => x.flat()), approvedBetween(from, to), getSettings()]);
  const rule = { breakAfterH: s.breakAfterH, breakMin: s.breakMin };
  return Response.json({ rows: buildRows(all, res, shifts, approved, from, to, rule, s.clockOn), rule, clockOn: s.clockOn });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const d = (await req.json().catch(() => ({}))) as { items?: Record<string, unknown>[] };
  const items = Array.isArray(d.items) ? d.items.slice(0, 200) : [];
  if (!items.length) return err("Inget att godkänna.");
  const people = new Map((await listResources()).filter((r) => r.kind === "person").map((r) => [r.id, r]));
  const out = [], bad: string[] = [];
  for (const it of items) {
    const p = people.get(String(it.rid)); if (!p) { bad.push("Okänd person."); continue; }
    try { out.push(await approve(it, p.name, u.name)); } catch (e) { bad.push((e as Error).message); }
  }
  if (bad.length && !out.length) return err(bad.join(" "));
  return Response.json({ approved: out, errors: bad });
}

export async function DELETE(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  try { await unapprove(q.get("rid") || "", q.get("date") || ""); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
