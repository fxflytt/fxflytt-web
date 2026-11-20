// Admin: "Vem kan jobba?" for a booked job. GET ?id= → who would be asked; POST ?id= {need, note} sends it;
// DELETE ?id= closes the question.
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, bookingsBetween } from "@/lib/booking/store.ts";
import { addDay } from "@/lib/booking/timesheet.ts";
// Other jobs that can collide with this one: a week either side is plenty (multi-day jobs included).
const around = (d?: string) => d ? bookingsBetween(addDay(d, -7), addDay(d, 7)) : Promise.resolve([]);
import { listResources } from "@/lib/booking/team.ts";
import { listAbsences } from "@/lib/booking/absence.ts";
import { ask, cancel, eligible } from "@/lib/booking/opencall.ts";
import { notifyCrew } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || ""); if (!b) return err("not-found", 404);
  const people = eligible(b, await around(b.date), await listResources(), await listAbsences());
  return Response.json({ people: people.map((r) => ({ id: r.id, name: r.name })) });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || ""); if (!b) return err("not-found", 404);
  const d = (await req.json().catch(() => ({}))) as { need?: unknown; note?: unknown };
  try {
    const people = await ask(b, d.need, d.note, u.name, await around(b.date), await listResources(), await listAbsences());
    const when = new Date(b.date! + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) + (b.time ? " kl. " + b.time : "");
    await notifyCrew(people.map((r) => r.id), { title: "🙋 Vem kan jobba?", body: `${when} · ${[b.data.from, b.data.to].filter(Boolean).map(town).join(" → ")}`, url: "/jobb#lediga", tag: "oc-" + b.id });
    return Response.json({ booking: b, asked: people.map((r) => r.name) });
  } catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || ""); if (!b) return err("not-found", 404);
  await cancel(b, u.name);
  return Response.json(b);
}
