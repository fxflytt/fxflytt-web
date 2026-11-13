// Customer side of the offer: view (GET ?t=) and sign or decline (POST {t, action, name, accept}).
import { bookingByToken, publicView, saveBooking, offerHash, TERMS_VERSION, DECLINE_REASONS, type DeclineReason } from "@/lib/booking/store.ts";
import { isAdmin } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { signedCustomerEmail, companyNoticeEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";
import { normPnr, normOrgnr } from "@/lib/booking/pnr.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function GET(req: Request) {
  if (!kvConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });
  if (rateLimited("bview:" + clientIp(req), 60, 10 * 60_000)) return Response.json({ error: "busy" }, { status: 429 });
  const b = await bookingByToken(new URL(req.url).searchParams.get("t") || "");
  if (!b || b.status === "cancelled") return Response.json({ error: "not-found" }, { status: 404 });
  // Count the customer's opens (not the admin's own previews).
  if (!isAdmin(req) && (b.status === "sent" || b.status === "declined" || b.status === "new")) {
    const now = Date.now();
    b.views = (b.views || 0) + 1; b.lastViewAt = now;
    if (!b.firstViewAt) b.firstViewAt = now;
    await saveBooking(b, b.views === 1 ? "Kunden öppnade offerten" : undefined).catch(() => {});
  }
  return Response.json(publicView(b), { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!kvConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });
  const ip = clientIp(req);
  if (rateLimited("bsign:" + ip, 10, 10 * 60_000)) return Response.json({ error: "För många försök." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b = await bookingByToken(typeof body.t === "string" ? body.t : "");
  if (!b || b.status === "cancelled") return Response.json({ error: "Offerten finns inte längre." }, { status: 404 });
  if (b.status === "signed" || b.status === "done") return Response.json({ error: "Offerten är redan signerad.", view: publicView(b) }, { status: 409 });
  const adminUrl = `${SITE}/admin#${b.id}`;

  if (body.action === "decline") {
    b.status = "declined"; b.declinedAt = Date.now();
    const reason = typeof body.reason === "string" && body.reason in DECLINE_REASONS ? (body.reason as DeclineReason) : undefined;
    const text = typeof body.reasonText === "string" ? body.reasonText.trim().slice(0, 400) : "";
    b.decline = reason || text ? { reason: reason || "other", ...(text ? { text } : {}) } : undefined;
    await saveBooking(b, "Kunden nekade offerten" + (b.decline ? ` – ${DECLINE_REASONS[b.decline.reason]}${text ? ": " + text : ""}` : ""));
    if (mailConfigured()) await send(COMPANY_TO, companyNoticeEmail(b, "declined", adminUrl)).catch(() => {});
    return Response.json({ ok: true, view: publicView(b) });
  }

  const name = typeof body.name === "string" ? body.name.trim().slice(0, 120) : "";
  if (name.length < 3) return Response.json({ error: "Skriv ditt för- och efternamn." }, { status: 400 });
  const isCompany = body.kind === "company";
  const idRaw = typeof body.pnr === "string" ? body.pnr : "";
  const pnr = isCompany ? "" : normPnr(idRaw);
  const orgnr = isCompany ? normOrgnr(idRaw) : "";
  if (!isCompany && !pnr) return Response.json({ error: "Skriv ett giltigt personnummer (ÅÅÅÅMMDD-XXXX)." }, { status: 400 });
  if (isCompany && !orgnr) return Response.json({ error: "Skriv ett giltigt organisationsnummer (XXXXXX-XXXX)." }, { status: 400 });
  if (body.accept !== true) return Response.json({ error: "Du behöver godkänna villkoren." }, { status: 400 });
  if (!b.offer || !(b.offer.total > 0) || !b.date) return Response.json({ error: "Offerten är inte klar än – ring oss." }, { status: 400 });

  const now = Date.now();
  b.status = "signed"; b.signedAt = now;
  b.signature = { name, ...(pnr ? { pnr } : { orgnr }), ip, ua: (req.headers.get("user-agent") || "").slice(0, 300), at: now, offerHash: offerHash(b), terms: TERMS_VERSION };
  await saveBooking(b, `Signerad av ${name}`);
  if (mailConfigured()) {
    await send(COMPANY_TO, companyNoticeEmail(b, "signed", adminUrl), b.data.email || undefined).catch((e) => console.error("notice", e));
    if (b.data.email) await send(b.data.email, signedCustomerEmail(b), COMPANY_TO).catch((e) => console.error("confirm", e));
  }
  return Response.json({ ok: true, view: publicView(b) });
}

