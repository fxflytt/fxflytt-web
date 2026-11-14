// Sends one reminder e-mail for an offer that has not been answered, and records it.
import { saveBooking, type Booking } from "./store.ts";
import { reminderEmail } from "../mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "../mail/send.ts";

const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function sendReminder(b: Booking, how: "auto" | "manual", by?: string): Promise<void> {
  if (!b.token) throw new Error("Offerten har inte skickats än.");
  if (!b.data.email) throw new Error("Kunden har ingen e-post – påminn via SMS eller telefon.");
  if (!mailConfigured()) throw new Error("E-post är inte inställd.");
  const n = (b.reminders?.length || 0) + 1;
  await send(b.data.email, reminderEmail(b, `${SITE}/signera?t=${b.token}`, n), COMPANY_TO);
  b.reminders = [...(b.reminders || []), Date.now()];
  await saveBooking(b, `Påminnelse ${n} skickad${how === "auto" ? " (automatiskt)" : ""}`, by);
}
