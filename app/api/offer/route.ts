// POST /api/offer – sends the customer's quote request as an e-mail to the company inbox.
// Needs SMTP_USER and SMTP_PASS in the Vercel environment (never in the code).
import { sendMail } from "@/lib/mail/smtp.ts";
import { offerEmail, customerConfirmation, type OfferData } from "@/lib/mail/offerEmail.ts";
import { clientIp } from "@/lib/rateLimit.ts";
import { guard, suspectNote } from "@/lib/spamGuard.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { createBooking, saveBooking } from "@/lib/booking/store.ts";
import { notifyAll } from "@/lib/booking/push.ts";
import { applyCode } from "@/lib/booking/referral.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { photoLink } from "@/lib/booking/custphotos.ts";
import { after } from "next/server";
import { instantOn, instantReply } from "@/lib/agents/instant.ts";
import { computePrice } from "@/lib/pricing/pricelist.js";
import { getPrices } from "@/lib/pricing/current.ts";

export const runtime = "nodejs";

const TO = process.env.OFFER_TO || "info@fxflytt.se";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
let lastError = "";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

// The price is NEVER taken from the browser (anyone can send "1 kr"). The form sends what the customer chose
// in the calculator (`calc`); the server computes the price again with the price list in use – like /api/lead.
const CALC = ["service", "areaM2", "distanceKm", "pkg", "crew", "hours", "boxes", "volumeM3", "extraCleaning", "glazing"];
type Prices = { hourly: Record<string, number> };
async function serverPrice(calc: unknown, extras: string[], distanceKm: number | undefined): Promise<OfferData["price"]> {
  if (!calc || typeof calc !== "object") return undefined;
  const input: Record<string, unknown> = Object.fromEntries(Object.entries(calc as Record<string, unknown>).filter(([k]) => CALC.includes(k)));
  if (distanceKm !== undefined) input.distanceKm = distanceKm;   // the distance between the two chosen addresses wins
  const P = (await getPrices()) as unknown as Prices;
  let q: { totalAfterRut: number | null; lines: { label: string; amount: number }[]; version?: string };
  try { q = computePrice(input as never, P as never) as typeof q; } catch { return undefined; }
  if (q.totalAfterRut == null) return undefined;
  const svc = String(input.service || ""), pkg = String(input.pkg || ""), h2 = P.hourly["2"] || 595, deluxe = svc === "move" && pkg === "deluxe";
  // Same "not included" list as the form shows the customer.
  const ni: string[] = [];
  if (extras.includes("Packning") && !deluxe) ni.push(`Packning – ${h2} kr/tim (2 pers) efter RUT, du betalar bara för den tid det tar`);
  if (extras.includes("Montering") && !deluxe) ni.push(`Ned- och montering – ${h2} kr/tim (2 pers) efter RUT, du betalar bara för den tid det tar`);
  if (extras.includes("Flyttstäd") && svc === "hourly") ni.push("Flyttstäd – fast pris efter boyta, från 2 000 kr efter RUT");
  if (extras.includes("Pianoflytt")) ni.push("Piano / tunga föremål – pris enligt offert");
  if (extras.includes("Bortforsling")) ni.push("Bortforsling – pris enligt offert");
  const note = svc === "hourly" ? `Minst 3 timmar. Du betalar för den tid flytten faktiskt tar (${P.hourly[String(input.crew || 2)] || h2} kr/tim efter RUT).` : undefined;
  return { total: q.totalAfterRut, lines: q.lines.map((l) => ({ label: l.label, amount: l.amount })), version: q.version, note, notIncluded: ni.length ? ni : undefined };
}

export async function POST(req: Request) {
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return Response.json({ error: "not-configured" }, { status: 503 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }
  if (!body || typeof body !== "object") return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

  // Honeypot: real visitors never fill this hidden field.
  if (str(body.website, 200)) return Response.json({ ok: true });

  const d = (body.data && typeof body.data === "object" ? body.data : {}) as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && isFinite(v) && v >= 0 && v < 1e7 ? v : undefined);
  const price = d.price as Record<string, unknown> | undefined;
  const volume = d.volume as Record<string, unknown> | undefined;
  const data: OfferData = {
    name: str(d.name, 120), phone: str(d.phone, 40), email: str(d.email, 200),
    from: str(d.from, 200), to: str(d.to, 200), distanceKm: num(d.distanceKm),
    size: str(d.size, 80), areaM2: str(d.areaM2, 10), home: str(d.home, 60),
    date: str(d.date, 20), dateType: str(d.dateType, 60), floorFrom: str(d.floorFrom, 140), floorTo: str(d.floorTo, 140),
    extras: Array.isArray(d.extras) ? d.extras.slice(0, 12).map((x) => str(x, 60)).filter(Boolean) : [],
    message: str(d.message, 3000),
    price: undefined,   // set below by serverPrice() – the browser's numbers are ignored
    volume: volume && num(volume.m3) !== undefined ? {
      m3: num(volume.m3)!, items: num(volume.items) ?? 0,
      list: Array.isArray(volume.list) ? volume.list.slice(0, 80).map((x) => str(x, 80)) : [],
    } : undefined,
  };
  if (!data.name || !data.phone) return Response.json({ error: "Namn och telefon behövs." }, { status: 400 });
  // Only when the customer had a price in the form (not for "Kontorsflytt, piano eller annat" or a move abroad).
  if (price) data.price = await serverPrice(d.calc, data.extras || [], data.distanceKm).catch(() => undefined);
  // Robots: time trap, limits per device, per phone number and for the whole site (lib/spamGuard.ts).
  const g = await guard("offer", clientIp(req), body.ft, data.phone);
  if (g.action === "drop") return Response.json({ ok: true });
  if (g.action === "block") return Response.json({ error: g.error }, { status: 429 });
  if (g.suspicious) data.message = suspectNote(g.reason) + (data.message || "");
  if (g.alert) after(() => notifyAll({ cat: "new", title: "⚠️ Ovanligt många förfrågningar", body: "Fler än 30 förfrågningar från hemsidan den senaste timmen – kan vara spam. De markeras med \"Möjlig spam\".", url: "/admin" }).then(() => {}, () => {}));
  if (!EMAIL_RE.test(data.email || "")) data.email = "";
  // Save it in the booking system too (if storage is set up). A failure here must not lose the e-mail.
  let adminUrl: string | undefined, createdId = "", photoUrl = "";
  if (kvConfigured()) {
    try {
      const b = await createBooking("web", data); createdId = b.id; adminUrl = `${process.env.SITE_URL || "https://www.fxflytt.se"}/admin#${b.id}`;
      photoUrl = await photoLink(b); await saveBooking(b);   // the customer can send photos of the home
      const code = str((d as Record<string, unknown>).refCode, 20);
      if (code) { try { await saveBooking(b, await applyCode(b, code, await getSettings())); } catch (e) { await saveBooking(b, `Rabattkod ${code} gick inte att använda: ${(e as Error).message}`); } }
      const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();
      await notifyAll({ cat: "new", title: (g.suspicious ? "⚠️ " : "") + "Ny förfrågan: " + data.name, body: [[data.from, data.to].filter(Boolean).map(town).join(" → "), data.size, data.price ? data.price.total.toLocaleString("sv-SE") + " kr" : ""].filter(Boolean).join(" · ") || "Från hemsidan", url: "/admin#" + b.id, tag: b.id });
    }
    catch (e) { console.error("booking save failed", (e as Error).message); }
  }
  const mail = offerEmail(data, new Date(), adminUrl);

  try {
    await sendMail(
      { host: process.env.SMTP_HOST || "mail.inleed.com", port: Number(process.env.SMTP_PORT || 465), user, pass },
      { from: user, to: TO, replyTo: data.email || undefined, subject: mail.subject, text: mail.text, html: mail.html },
    );
    lastError = "";
  } catch (e) {
    lastError = (e as Error).message;
    console.error("offer mail failed", lastError);
    return Response.json({ error: "send-failed" }, { status: 502 });
  }
  // Elsa (AI-teamet) answers at once – a personal e-mail and/or SMS – when the owner turned it on. She sends the
  // standard receipt herself if her own e-mail cannot be sent. It runs after the answer to the browser, so the visitor never waits.
  let confirmed = false;
  if (createdId && await instantOn().catch(() => false)) {
    after(() => instantReply(createdId).catch((e) => console.error("instant", (e as Error).message)));
    return Response.json({ ok: true, confirmed: !!data.email, photoUrl });
  }
  // Confirmation to the customer. A failure here must not fail the request – we already have it.
  if (data.email) {
    try {
      const c = customerConfirmation(data, photoUrl);
      await sendMail(
        { host: process.env.SMTP_HOST || "mail.inleed.com", port: Number(process.env.SMTP_PORT || 465), user, pass },
        { from: user, to: data.email, replyTo: TO, subject: c.subject, text: c.text, html: c.html },
      );
      confirmed = true;
    } catch (e) {
      lastError = "confirmation: " + (e as Error).message;
      console.error("confirmation mail failed", lastError);
    }
  }
  return Response.json({ ok: true, confirmed, photoUrl });
}

export async function GET() {
  return Response.json({ configured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), to: TO, lastError });
}
