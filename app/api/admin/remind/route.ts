// Admin: send a reminder right now (POST ?id=).
//   default        reminder about an unanswered offer
//   &kind=boxes    reminder to return rented moving boxes
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, boxesOut } from "@/lib/booking/store.ts";
import { sendReminder } from "@/lib/booking/remind.ts";
import { boxesReminderEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  const b = await getBooking(q.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  if (q.get("kind") === "boxes") {
    if (!boxesOut(b)) return Response.json({ error: "Inga kartonger ute." }, { status: 400 });
    if (!b.data.email) return Response.json({ error: "Kunden har ingen e-post – ring eller skicka SMS." }, { status: 400 });
    if (!mailConfigured()) return Response.json({ error: "E-post är inte inställd." }, { status: 503 });
    try { await send(b.data.email, boxesReminderEmail(b), COMPANY_TO); }
    catch (e) { return Response.json({ error: "Kunde inte skicka: " + (e as Error).message }, { status: 502 }); }
    b.boxes!.remindedAt = Date.now();
    await saveBooking(b, "Påminnelse om kartonger skickad till " + b.data.email, u.name);
    return Response.json({ ok: true, booking: b });
  }
  if (b.status !== "sent") return Response.json({ error: "Påminnelse går bara att skicka för en skickad offert." }, { status: 400 });
  try { await sendReminder(b, "manual", u.name); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  return Response.json({ ok: true, booking: b });
}
