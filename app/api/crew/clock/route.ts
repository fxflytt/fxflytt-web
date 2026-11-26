// Crew app time clock. GET → {on, office, radius, open}. POST {action: "in"|"out", lat, lon, acc}.
// Allowed only within the radius around the office; the position is saved with the stamp.
import { crewUser } from "@/lib/booking/crew.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { checkPlace, openShift, clockIn, clockOut } from "@/lib/booking/clock.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const s = await getSettings(), open = await openShift(me.id);
  return Response.json({ on: s.clockOn && !!s.office, office: s.office?.label || "kontoret", radius: s.clockRadiusM, open: open ? { in: open.in } : null });
}

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  if (await rateLimited("clock:" + me.id + clientIp(req), 20, 10 * 60_000)) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  const d = (await req.json().catch(() => ({}))) as { action?: unknown; lat?: unknown; lon?: unknown; acc?: unknown };
  const place = checkPlace(await getSettings(), d);
  if (!place.ok) return Response.json({ error: place.error }, { status: 403 });
  try {
    const sh = d.action === "out" ? await clockOut(me, place.loc) : await clockIn(me, place.loc);
    return Response.json({ ok: true, in: sh.in, out: sh.out || null });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 409 }); }
}
