// Daily job (vercel.json): e-mails reminder 1 about a day after the offer was sent and reminder 2 after
// about three days, unless the customer has signed or declined. Also asks customers for a Google review
// after a finished job, when that is switched on in Inställningar → Omdömen, and makes the daily backup. Safe to call repeatedly – a reminder is
// only sent when it is due and is recorded on the booking.
import { listBookings, reminderDue } from "@/lib/booking/store.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { sendReminder } from "@/lib/booking/remind.ts";
import { saveBooking } from "@/lib/booking/store.ts";
import { getSettings, reviewDue } from "@/lib/booking/settings.ts";
import { reviewEmail } from "@/lib/mail/bookingEmail.ts";
import { dailyBackup } from "@/lib/booking/backup.ts";
import { send, mailConfigured } from "@/lib/mail/send.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

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
  const settings = await getSettings(), today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const reviews: string[] = [];
  if (settings.reviewOn && mailConfigured()) for (const b of await listBookings(1000)) {
    if (!reviewDue(b, settings, today)) continue;
    try { await send(b.data.email!, reviewEmail(b, settings.reviewUrl)); b.reviewSentAt = Date.now(); await saveBooking(b, "Bad om omdöme på Google (e-post)"); reviews.push(b.id); }
    catch (e) { failed.push(`${b.id}: ${(e as Error).message}`); }
  }
  // Daily backup to Vercel Blob (when connected). A failure must not stop the reminders above.
  const backup = await dailyBackup().catch((e) => "fel: " + (e as Error).message);
  return Response.json({ ok: true, sent, reviews, backup, failed });
}
