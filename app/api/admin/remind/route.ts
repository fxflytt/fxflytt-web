// Admin: send a reminder about the offer right now (POST ?id=).
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking } from "@/lib/booking/store.ts";
import { sendReminder } from "@/lib/booking/remind.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  if (b.status !== "sent") return Response.json({ error: "Påminnelse går bara att skicka för en skickad offert." }, { status: 400 });
  try { await sendReminder(b, "manual", u.name); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  return Response.json({ ok: true, booking: b });
}
