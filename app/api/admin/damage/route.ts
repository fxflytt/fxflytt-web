// Admin: damage reports.
//   GET                → { damages }
//   POST {kind, bookingId | vid, date, title, desc}   – new report from the office
//   POST ?id=&photo=1  (image body)
//   PATCH ?id= {status, cost, paidBy, claimNo, outcome, title, note}
//   DELETE ?id=        (owner)
import { requireUser } from "@/lib/booking/auth.ts";
import { listDamages, addDamage, addDamagePhoto, updateDamage, removeDamage } from "@/lib/booking/damage.ts";
import { listResources } from "@/lib/booking/team.ts";
import { getBooking, saveBooking } from "@/lib/booking/store.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  return Response.json({ damages: await listDamages() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("photo")) {
      const buf = new Uint8Array(await req.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.", 413);
      return Response.json(await addDamagePhoto(q.get("id") || "", await storePhoto("skador", buf), u.name));
    }
    const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const b = typeof d.bookingId === "string" && d.bookingId ? await getBooking(d.bookingId) : null;
    if (d.bookingId && !b) return err("Hittar inte bokningen.");
    const v = (await listResources()).find((r) => r.id === d.vid && r.kind === "vehicle");
    const x = await addDamage(d, u.name, { booking: b ? { id: b.id, name: b.data.name } : undefined, vehicle: v ? { id: v.id, name: v.name } : undefined });
    if (b) await saveBooking(b, `Skada rapporterad: ${x.title}`, u.name);
    return Response.json(x);
  } catch (e) { return err((e as Error).message); }
}

export async function PATCH(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  try { return Response.json(await updateDamage(new URL(req.url).searchParams.get("id") || "", (await req.json().catch(() => ({}))) as Record<string, unknown>, u.name)); }
  catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  try { await removeDamage(new URL(req.url).searchParams.get("id") || ""); return Response.json({ ok: true }); }
  catch (e) { return err((e as Error).message); }
}
