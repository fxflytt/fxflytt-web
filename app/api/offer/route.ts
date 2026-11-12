// POST /api/offer – sends the customer's quote request as an e-mail to the company inbox.
// Needs SMTP_USER and SMTP_PASS in the Vercel environment (never in the code).
import { sendMail } from "@/lib/mail/smtp.ts";
import { offerEmail, customerConfirmation, type OfferData } from "@/lib/mail/offerEmail.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";

const TO = process.env.OFFER_TO || "info@fxflytt.se";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
let lastError = "";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function POST(req: Request) {
  if (rateLimited("offer:" + clientIp(req), 5, 10 * 60_000)) {
    return Response.json({ error: "För många förfrågningar. Ring oss gärna på 076-300 07 23." }, { status: 429 });
  }
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
    price: price && num(price.total) !== undefined && Array.isArray(price.lines) ? {
      total: num(price.total)!, version: str(price.version, 60),
      lines: price.lines.slice(0, 12).map((l: any) => ({ label: str(l?.label, 120), amount: num(l?.amount) ?? 0 })),
      notIncluded: Array.isArray(price.notIncluded) ? price.notIncluded.slice(0, 8).map((t: unknown) => str(t, 140)).filter(Boolean) as string[] : undefined,
    } : undefined,
    volume: volume && num(volume.m3) !== undefined ? {
      m3: num(volume.m3)!, items: num(volume.items) ?? 0,
      list: Array.isArray(volume.list) ? volume.list.slice(0, 80).map((x) => str(x, 80)) : [],
    } : undefined,
  };
  if (!data.name || !data.phone) return Response.json({ error: "Namn och telefon behövs." }, { status: 400 });
  if (!EMAIL_RE.test(data.email || "")) data.email = "";
  const mail = offerEmail(data, new Date());

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
  // Confirmation to the customer. A failure here must not fail the request – we already have it.
  let confirmed = false;
  if (data.email) {
    try {
      const c = customerConfirmation(data);
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
  return Response.json({ ok: true, confirmed });
}

export async function GET() {
  return Response.json({ configured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), to: TO, lastError });
}
