// POST /api/kontakt – quick "call me back" form. Sends a short e-mail to the company inbox.
import { sendMail } from "@/lib/mail/smtp.ts";
import { callbackEmail } from "@/lib/mail/offerEmail.ts";
import { clientIp } from "@/lib/rateLimit.ts";
import { guard, suspectNote } from "@/lib/spamGuard.ts";
import { notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
const TO = process.env.OFFER_TO || "info@fxflytt.se";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const PHONE_RE = /^[+\d][\d\s\-()]{5,19}$/;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function POST(req: Request) {
  const user = process.env.SMTP_USER, pass = process.env.SMTP_PASS;
  if (!user || !pass) return Response.json({ error: "not-configured" }, { status: 503 });
  let b: Record<string, unknown>;
  try { b = await req.json(); } catch { return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }
  if (!b || typeof b !== "object") return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  if (str(b.website, 200)) return Response.json({ ok: true }); // honeypot

  const d = {
    name: str(b.name, 80), phone: str(b.phone, 30), email: str(b.email, 200), topic: str(b.topic, 60),
    when: str(b.when, 60), message: str(b.message, 1500), page: str(b.page, 120),
  };
  if (!d.name || !PHONE_RE.test(d.phone)) return Response.json({ error: "Fyll i namn och ett giltigt telefonnummer." }, { status: 400 });
  if (!EMAIL_RE.test(d.email)) d.email = "";
  const g = await guard("kontakt", clientIp(req), b.ft, d.phone);
  if (g.action === "drop") return Response.json({ ok: true });
  if (g.action === "block") return Response.json({ error: g.error }, { status: 429 });
  if (g.suspicious) d.message = suspectNote(g.reason) + d.message;
  if (g.alert) await notifyAll({ cat: "new", title: "⚠️ Ovanligt många förfrågningar", body: "Fler än 30 förfrågningar från hemsidan den senaste timmen – kan vara spam.", url: "/admin" }).catch(() => 0);
  const m = callbackEmail(d, new Date());
  try {
    await sendMail(
      { host: process.env.SMTP_HOST || "mail.inleed.com", port: Number(process.env.SMTP_PORT || 465), user, pass },
      { from: user, to: TO, replyTo: d.email || undefined, subject: m.subject, text: m.text, html: m.html },
    );
    return Response.json({ ok: true });
  } catch (e) {
    console.error("kontakt mail failed", (e as Error).message);
    return Response.json({ error: "send-failed" }, { status: 502 });
  }
}
