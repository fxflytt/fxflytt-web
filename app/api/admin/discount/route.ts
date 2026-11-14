// Admin: lower the price by a percentage and e-mail the customer the new offer (POST ?id= {pct, send}).
// pct 0 removes an earlier discount. With send=false only the new price is saved (no e-mail).
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, issueToken, applyDiscount } from "@/lib/booking/store.ts";
import { discountEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";

export const runtime = "nodejs";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  if (b.status === "signed" || b.status === "done" || b.status === "cancelled") return Response.json({ error: "Rabatt går inte att ge på en signerad eller avbokad bokning." }, { status: 400 });
  if (!b.offer || !(b.offer.total > 0)) return Response.json({ error: "Sätt ett pris först." }, { status: 400 });
  if (!b.date) return Response.json({ error: "Sätt ett datum först." }, { status: 400 });
  const body = (await req.json().catch(() => ({}))) as { pct?: unknown; send?: unknown };
  const pct = Math.round(Number(body.pct));
  if (!(pct >= 0 && pct <= 50)) return Response.json({ error: "Rabatten måste vara 0–50 %." }, { status: 400 });
  const before = b.offer.total;
  applyDiscount(b, pct);
  const token = await issueToken(b);
  const url = `${SITE}/signera?t=${token}`;
  let mailed = false;
  if (body.send !== false && pct > 0 && b.data.email) {
    if (!mailConfigured()) return Response.json({ error: "E-post är inte inställd." }, { status: 503 });
    try { await send(b.data.email, discountEmail(b, url), COMPANY_TO); mailed = true; }
    catch (e) { return Response.json({ error: "Kunde inte skicka: " + (e as Error).message }, { status: 502 }); }
  }
  b.status = "sent"; b.sentAt = Date.now(); b.reminders = []; b.declinedAt = undefined;
  await saveBooking(b, pct > 0
    ? `Rabatt ${pct} %: ${before} → ${b.offer!.total} kr${mailed ? ", nytt pris mejlat till " + b.data.email : " (skickas manuellt)"}`
    : `Rabatten borttagen: ${before} → ${b.offer!.total} kr`, u.name);
  return Response.json({ ok: true, url, mailed, booking: b });
}
