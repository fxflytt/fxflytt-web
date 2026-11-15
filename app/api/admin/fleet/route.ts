// Admin: vehicles – reminders and cost log.
//   GET                          → { fleet, due, year: costs this year, month: costs this month }
//   PATCH ?vid=  {reg, km, due:{besiktning,…}, serviceKm, serviceEveryKm}
//   POST  ?vid=  {kind, date, kr, liters, km, note, next}   – log a cost / a done reminder
//   POST  ?log=&photo=1  (image body)                       – receipt photo
//   DELETE ?log=
import { requireUser } from "@/lib/booking/auth.ts";
import { getFleet, setVehicle, addLog, setLogPhoto, removeLog, dueSoon, costs } from "@/lib/booking/fleet.ts";
import { listResources } from "@/lib/booking/team.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const day = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

async function vehicle(vid: string | null) {
  return (await listResources()).find((r) => r.id === vid && r.kind === "vehicle") || null;
}

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const [f, res] = await Promise.all([getFleet(), listResources()]), t = day();
  return Response.json({ fleet: f, due: dueSoon(f, res, t), year: costs(f, t.slice(0, 4) + "-01-01", t), month: costs(f, t.slice(0, 7) + "-01", t) });
}

export async function PATCH(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const vid = new URL(req.url).searchParams.get("vid");
  if (!(await vehicle(vid))) return err("Hittar inte fordonet.", 404);
  try { return Response.json(await setVehicle(vid!, (await req.json().catch(() => ({}))) as Record<string, unknown>)); }
  catch (e) { return err((e as Error).message); }
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("photo")) {
      const buf = new Uint8Array(await req.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.", 413);
      await setLogPhoto(q.get("log") || "", await storePhoto("fordon", buf));
      return Response.json({ ok: true });
    }
    const vid = q.get("vid");
    if (!(await vehicle(vid))) return err("Hittar inte fordonet.", 404);
    return Response.json(await addLog(vid!, (await req.json().catch(() => ({}))) as Record<string, unknown>, u.name));
  } catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  try { await removeLog(new URL(req.url).searchParams.get("log") || ""); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
