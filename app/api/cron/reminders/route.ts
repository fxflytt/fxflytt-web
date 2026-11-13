// Daily job (vercel.json): e-mails reminder 1 about a day after the offer was sent and reminder 2 after
// about three days, unless the customer has signed or declined. Safe to call repeatedly – a reminder is
// only sent when it is due and is recorded on the booking.
import { listBookings, reminderDue } from "@/lib/booking/store.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { sendReminder } from "@/lib/booking/remind.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!kvConfigured()) return Response.json({ error: "storage" }, { status: 503 });
  const now = Date.now(), sent: string[] = [], failed: string[] = [];
  for (const b of await listBookings()) {
    if (!reminderDue(b, now)) continue;
    try { await sendReminder(b, "auto"); sent.push(b.id); }
    catch (e) { failed.push(`${b.id}: ${(e as Error).message}`); }
  }
  return Response.json({ ok: true, sent, failed });
}
