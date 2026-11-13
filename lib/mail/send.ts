// One place for the SMTP settings (Vercel env: SMTP_USER, SMTP_PASS, optional SMTP_HOST/PORT).
import { sendMail } from "./smtp.ts";

export const COMPANY_TO = process.env.OFFER_TO || "info@fxflytt.se";
export const mailConfigured = () => Boolean(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function send(to: string, m: { subject: string; text: string; html: string }, replyTo?: string) {
  const user = process.env.SMTP_USER!, pass = process.env.SMTP_PASS!;
  await sendMail(
    { host: process.env.SMTP_HOST || "mail.inleed.com", port: Number(process.env.SMTP_PORT || 465), user, pass },
    { from: user, to, replyTo, subject: m.subject, text: m.text, html: m.html },
  );
}
