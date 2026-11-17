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
import { issueCode } from "@/lib/booking/referral.ts";
import { notifyAll } from "@/lib/booking/push.ts";
import { getFleet, dueSoon } from "@/lib/booking/fleet.ts";
import { listResources } from "@/lib/booking/team.ts";
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
  if ((settings.reviewOn || settings.refOn) && mailConfigured()) for (const b of await listBookings(1000)) {
    if (!reviewDue(b, settings, today)) continue;
    try {
      const ref = settings.refOn ? { code: await issueCode(b), kr: settings.refFriendKr, reward: settings.refReward } : null;
      await send(b.data.email!, reviewEmail(b, settings.reviewOn ? settings.reviewUrl : "", ref)); b.reviewSentAt = Date.now();
      await saveBooking(b, "Tackmejl skickat" + (settings.reviewOn ? " med länk till Google-omdöme" : "") + (ref ? ` och koden ${ref.code} (Tipsa en vän)` : "")); reviews.push(b.id); }
    catch (e) { failed.push(`${b.id}: ${(e as Error).message}`); }
  }
  // Morning sales note to the office: calls to make today and requests nobody has answered.
  const all = await listBookings();
  const calls = all.filter((b) => b.followUp && b.followUp.at.slice(0, 10) <= today && !["signed", "done", "cancelled", "declined"].includes(b.status)).length;
  const unanswered = all.filter((b) => b.status === "new" && b.source === "web" && !b.firstResponseAt).length;
  if (calls || unanswered) await notifyAll({ cat: "morning", title: "God morgon! Försäljning i dag", body: [calls ? `${calls} samtal att ringa` : "", unanswered ? `${unanswered} obesvarade förfrågningar` : ""].filter(Boolean).join(" · "), url: "/admin", tag: "morning" });
  // Vehicles: a note 30, 14, 7 and 1 days before, on the day, and every Monday while it is late.
  try {
    const monday = new Date(today + "T12:00:00Z").getUTCDay() === 1;
    const due = dueSoon(await getFleet(), await listResources(), today)
      .filter((d) => d.days !== undefined ? [30, 14, 7, 1, 0].includes(d.days) || (d.late && monday) : d.late ? monday : d.kmLeft !== undefined && d.kmLeft <= 500 && monday);
    if (due.length) await notifyAll({ cat: "morning",
      title: due.some((d) => d.late) ? "🚚 Fordon: något är försenat" : "🚚 Fordon: snart dags",
      body: due.slice(0, 4).map((d) => `${d.name}: ${d.label.toLowerCase()} ${d.late ? "försenad" : d.days === 0 ? "i dag" : d.days !== undefined ? `om ${d.days} dagar` : `om ${d.kmLeft} km`}`).join(" · "),
      url: "/admin#fordon", tag: "fleet",
    });
  } catch (e) { console.error("fleet reminder", e); }
  // Daily backup to Vercel Blob (when connected). A failure must not stop the reminders above.
  const backup = await dailyBackup().catch((e) => "fel: " + (e as Error).message);
  return Response.json({ ok: true, sent, reviews, backup, failed });
}
