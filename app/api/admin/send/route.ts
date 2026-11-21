// Admin: e-mail the offer link to the customer (POST ?id=). Returns the link as well.
//   &linkOnly=1  only make the link (sent by SMS by hand)
//   &preview=1   make the link to look at it first – nothing is sent and the status does not change
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, issueToken } from "@/lib/booking/store.ts";
import { packagesFor } from "@/lib/booking/packages.ts";
import { getPrices } from "@/lib/pricing/current.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { validFor, ensureIntro } from "@/lib/booking/offerplus.ts";
import { offerLinkEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";

export const runtime = "nodejs";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  if (!b.offer || !(b.offer.total > 0)) return Response.json({ error: "Sätt ett pris först." }, { status: 400 });
  if (!b.date) return Response.json({ error: "Sätt ett datum först." }, { status: 400 });
  if (b.status === "signed" || b.status === "done") return Response.json({ error: "Offerten är redan signerad." }, { status: 400 });
  // Let the customer choose Bas / Premium / Deluxe (fixed-price moves made with the price list).
  b.packages = b.pkgChoiceOff ? undefined : (packagesFor(b, await getPrices()) || undefined);
  // End date and the seller's greeting (from the template, when the offer has none yet).
  const st = await getSettings();
  b.validUntil = validFor(b, st.offerValidDays); b.renewAskedAt = undefined;
  await ensureIntro(b, st, u.id, u.name).catch((e) => console.error("intro", e));
  const token = await issueToken(b);
  const url = `${SITE}/signera?t=${token}`;
  if (new URL(req.url).searchParams.get("preview") === "1") { await saveBooking(b); return Response.json({ ok: true, url: url + "&preview=1" }); }
  const only = new URL(req.url).searchParams.get("linkOnly") === "1";
  if (!only) {
    if (!b.data.email) return Response.json({ error: "Kunden har ingen e-post – kopiera länken och skicka via SMS." , url }, { status: 400 });
    if (!mailConfigured()) return Response.json({ error: "E-post är inte inställd." }, { status: 503 });
    try { await send(b.data.email, offerLinkEmail(b, url), COMPANY_TO); }
    catch (e) { return Response.json({ error: "Kunde inte skicka: " + (e as Error).message }, { status: 502 }); }
  }
  if (b.status === "new" || b.status === "declined") b.status = "sent";
  b.sentAt = Date.now(); b.reminders = []; if (!b.sentById) { b.sentBy = u.name; b.sentById = u.id; }
  await saveBooking(b, only ? "Länk skapad (skickas manuellt)" : "Offert skickad till " + b.data.email, u.name);
  return Response.json({ ok: true, url, booking: b });
}
