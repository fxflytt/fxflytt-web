// Customer side of the offer: view (GET ?t=) and sign or decline (POST {t, action, name, accept}).
import { bookingByToken, publicView, saveBooking, offerHash, applyExtras, isExpired, TERMS_VERSION, DECLINE_REASONS, type DeclineReason } from "@/lib/booking/store.ts";
import { addQuestion } from "@/lib/booking/offerplus.ts";
import { isAdmin } from "@/lib/booking/auth.ts";
import { SIZE_LABEL, type PkgId } from "@/lib/booking/packages.ts";
import { rewardOnSign } from "@/lib/booking/referral.ts";
import { notifyAll, recordNote } from "@/lib/booking/push.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings, trustView } from "@/lib/booking/settings.ts";
import { signedCustomerEmail, companyNoticeEmail, questionNoticeEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";
import { normPnr, normOrgnr } from "@/lib/booking/pnr.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function GET(req: Request) {
  if (!kvConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });
  if (await rateLimited("bview:" + clientIp(req), 60, 10 * 60_000)) return Response.json({ error: "busy" }, { status: 429 });
  const b = await bookingByToken(new URL(req.url).searchParams.get("t") || "");
  if (!b || b.status === "cancelled") return Response.json({ error: "not-found" }, { status: 404 });
  // Count the customer's opens (not the admin's own previews).
  if (!isAdmin(req) && (b.status === "sent" || b.status === "declined" || b.status === "new")) {
    const now = Date.now(), quiet = b.lastViewAt && now - b.lastViewAt < 3600_000;
    if (!quiet) await recordNote({ cat: "view", title: `👁 ${b.data.name} öppnade offerten`, body: (b.views ? `${b.views + 1}:e gången` : "Första gången") + (b.offer ? ` · ${b.offer.total.toLocaleString("sv-SE")} kr` : ""), url: "/admin#" + b.id }).catch(() => {});
    b.views = (b.views || 0) + 1; b.lastViewAt = now;
    if (!b.firstViewAt) b.firstViewAt = now;
    await saveBooking(b, b.views === 1 ? "Kunden öppnade offerten" : undefined).catch(() => {});
  }
  const trust = await getSettings().then(trustView).catch(() => null);
  return Response.json({ ...publicView(b), trust }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!kvConfigured()) return Response.json({ error: "unavailable" }, { status: 503 });
  const ip = clientIp(req);
  if (await rateLimited("bsign:" + ip, 10, 10 * 60_000)) return Response.json({ error: "För många försök." }, { status: 429 });
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const b = await bookingByToken(typeof body.t === "string" ? body.t : "");
  if (!b || b.status === "cancelled") return Response.json({ error: "Offerten finns inte längre." }, { status: 404 });
  if (b.status === "signed" || b.status === "done") return Response.json({ error: "Offerten är redan signerad.", view: publicView(b) }, { status: 409 });
  const adminUrl = `${SITE}/admin#${b.id}`;

  // A question about the offer: saved in the offer, the office gets a notice and answers from the admin page.
  if (body.action === "ask") {
    if (await rateLimited("bask:" + ip, 6, 60 * 60_000)) return Response.json({ error: "Du har skickat många frågor – ring oss på 076-300 07 23." }, { status: 429 });
    let x;
    try { x = addQuestion(b, body.text); } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
    await saveBooking(b, "Kunden frågade: " + x.q.slice(0, 160));
    await notifyAll({ cat: "question", title: "❓ " + b.data.name + " har en fråga", body: x.q.slice(0, 140), url: "/admin#" + b.id, tag: "q-" + b.id });
    if (mailConfigured()) await send(COMPANY_TO, questionNoticeEmail(b, "question", x.q, adminUrl), b.data.email || undefined).catch(() => {});
    return Response.json({ ok: true, view: publicView(b) });
  }
  // The offer ran out: the customer asks for a new one (the office sets a new end date or sends a new version).
  if (body.action === "renew") {
    if (!isExpired(b)) return Response.json({ ok: true, view: publicView(b) });
    if (!b.renewAskedAt) {
      b.renewAskedAt = Date.now();
      await saveBooking(b, "Kunden vill ha en ny offert (den gamla gick ut)");
      await notifyAll({ cat: "question", title: "🔁 " + b.data.name + " vill ha en ny offert", body: "Offerten gick ut " + b.validUntil, url: "/admin#" + b.id, tag: "r-" + b.id });
      if (mailConfigured()) await send(COMPANY_TO, questionNoticeEmail(b, "renew", "", adminUrl), b.data.email || undefined).catch(() => {});
    }
    return Response.json({ ok: true, view: publicView(b) });
  }

  if (body.action === "decline") {
    b.status = "declined"; b.declinedAt = Date.now();
    const reason = typeof body.reason === "string" && body.reason in DECLINE_REASONS ? (body.reason as DeclineReason) : undefined;
    const text = typeof body.reasonText === "string" ? body.reasonText.trim().slice(0, 400) : "";
    b.decline = reason || text ? { reason: reason || "other", ...(text ? { text } : {}) } : undefined;
    await saveBooking(b, "Kunden nekade offerten" + (b.decline ? ` – ${DECLINE_REASONS[b.decline.reason]}${text ? ": " + text : ""}` : ""));
    if (mailConfigured()) await send(COMPANY_TO, companyNoticeEmail(b, "declined", adminUrl)).catch(() => {});
    await notifyAll({ cat: "declined", title: "❌ " + b.data.name + " tackade nej", body: b.decline ? DECLINE_REASONS[b.decline.reason] + (text ? ": " + text : "") : "Ingen anledning angiven", url: "/admin#" + b.id, tag: b.id });
    return Response.json({ ok: true, view: publicView(b) });
  }

  if (isExpired(b)) return Response.json({ error: "Offerten har gått ut. Be om en ny offert så hör vi av oss.", view: publicView(b) }, { status: 409 });
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

  // The customer may have picked another package in the offer.
  let pkgNote = "";
  const pk = b.packages?.find((p) => p.id === body.pkg);
  if (pk && (pk.total !== b.offer.total || JSON.stringify(pk.lines) !== JSON.stringify(b.offer.lines))) {
    b.offer = { ...b.offer, total: pk.total, lines: pk.lines, custom: false };
    b.data = { ...b.data, size: SIZE_LABEL[pk.id as PkgId] };
    pkgNote = ` – valde ${pk.name}`;
  }
  // Cleaning is already in Premium/Deluxe: a cleaning add-on is then not added.
  if (pk && pk.id !== "bas" && Array.isArray(body.extras)) body.extras = (body.extras as unknown[]).filter((id) => !(b.extras || []).some((e) => e.id === id && /flyttstäd/i.test(e.label)));
  const chosen = applyExtras(b, body.extras);
  const now = Date.now();
  b.status = "signed"; b.signedAt = now;
  b.signature = { name, ...(pnr ? { pnr } : { orgnr }), ip, ua: (req.headers.get("user-agent") || "").slice(0, 300), at: now, offerHash: offerHash(b), terms: TERMS_VERSION };
  const referrer = await rewardOnSign(b).catch(() => null);
  await saveBooking(b, `Signerad av ${name}` + pkgNote + (chosen.length ? ` med tillval: ${chosen.map((e) => e.label).join(", ")}` : ""));
  // Crew already planned on the job: it is now booked, tell them.
  if (b.crew?.length) await notifyAll({ title: "Nytt jobb", body: b.date + (b.time ? " kl. " + b.time : ""), url: "/jobb", tag: "job-" + b.id }, (s) => b.crew!.some((id) => s.userId === "crew:" + id));
  if (referrer) await notifyAll({ cat: "reward", title: "🎁 Belöning att ge", body: `${b.data.name} bokade med ${referrer.data.name}s kod`, url: "/admin#" + referrer.id, tag: "ref-" + b.id });
  await notifyAll({ cat: "signed", title: "✅ " + b.data.name + " signerade!", body: `${b.offer.total.toLocaleString("sv-SE")} kr · ${b.date}` + (chosen.length ? " · med tillval" : ""), url: "/admin#" + b.id, tag: b.id });
  if (mailConfigured()) {
    await send(COMPANY_TO, companyNoticeEmail(b, "signed", adminUrl), b.data.email || undefined).catch((e) => console.error("notice", e));
    if (b.data.email) await send(b.data.email, signedCustomerEmail(b), COMPANY_TO).catch((e) => console.error("confirm", e));
  }
  return Response.json({ ok: true, view: publicView(b) });
}

