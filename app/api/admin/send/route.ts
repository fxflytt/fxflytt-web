// Admin: e-mail the offer link to the customer (POST ?id=). Returns the link as well.
import { isAdmin, unauthorized } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, issueToken } from "@/lib/booking/store.ts";
import { offerLinkEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";

export const runtime = "nodejs";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  if (!b.offer || !(b.offer.total > 0)) return Response.json({ error: "Sätt ett pris först." }, { status: 400 });
  if (!b.date) return Response.json({ error: "Sätt ett datum först." }, { status: 400 });
  if (b.status === "signed" || b.status === "done") return Response.json({ error: "Offerten är redan signerad." }, { status: 400 });
  const token = await issueToken(b);
  const url = `${SITE}/signera?t=${token}`;
  const only = new URL(req.url).searchParams.get("linkOnly") === "1";
  if (!only) {
    if (!b.data.email) return Response.json({ error: "Kunden har ingen e-post – kopiera länken och skicka via SMS." , url }, { status: 400 });
    if (!mailConfigured()) return Response.json({ error: "E-post är inte inställd." }, { status: 503 });
    try { await send(b.data.email, offerLinkEmail(b, url), COMPANY_TO); }
    catch (e) { return Response.json({ error: "Kunde inte skicka: " + (e as Error).message }, { status: 502 }); }
  }
  if (b.status === "new" || b.status === "declined") b.status = "sent";
  b.sentAt = Date.now(); b.reminders = [];
  await saveBooking(b, only ? "Länk skapad (skickas manuellt)" : "Offert skickad till " + b.data.email);
  return Response.json({ ok: true, url, booking: b });
}
