// POST /api/offer – sends the customer's quote request as an e-mail to the company inbox.
// Needs SMTP_USER and SMTP_PASS in the Vercel environment (never in the code).
import { sendMail } from "@/lib/mail/smtp.ts";
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

  const name = str(body.name, 120), phone = str(body.phone, 40), email = str(body.email, 200);
  const text = str(body.text, 8000);
  if (!name || !phone || !text) return Response.json({ error: "Namn och telefon behövs." }, { status: 400 });

  try {
    await sendMail(
      { host: process.env.SMTP_HOST || "mail.inleed.com", port: Number(process.env.SMTP_PORT || 465), user, pass },
      {
        from: user,
        to: TO,
        replyTo: EMAIL_RE.test(email) ? email : undefined,
        subject: `Ny offertförfrågan – ${name} (${phone})`,
        text: text + "\n\n—\nSkickat från formuläret på fxflytt.se " + new Date().toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }),
      },
    );
    lastError = "";
    return Response.json({ ok: true });
  } catch (e) {
    lastError = (e as Error).message;
    console.error("offer mail failed", lastError);
    return Response.json({ error: "send-failed" }, { status: 502 });
  }
}

export async function GET() {
  return Response.json({ configured: Boolean(process.env.SMTP_USER && process.env.SMTP_PASS), to: TO, lastError });
}
