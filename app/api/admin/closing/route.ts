// Admin: AI-säljaren.
//   GET                                   → { list: offers worth a personal e-mail today, best first }
//   POST ?id= {action:"draft", hint}      the AI writes a personal e-mail for the offer → { subject, body, tip }
//   POST ?id= {action:"send", subject, body}   e-mail it to the customer with the offer link
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getBooking, saveBooking, listBookings } from "@/lib/booking/store.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";
import { personalOfferEmail } from "@/lib/mail/bookingEmail.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { draftClosing, closingCandidates } from "@/lib/agents/sales.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const list = closingCandidates(await listBookings(1500)).slice(0, 15).map(({ b, score }) => ({ id: b.id, name: b.data.name, total: b.offer?.total || 0, views: b.views || 0, lastViewAt: b.lastViewAt, sentAt: b.sentAt, date: b.date, score }));
  return Response.json({ list, ai: aiConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return err("Hittar inte offerten.", 404);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (b.status !== "sent" || !b.token) return err("Offerten måste vara skickad och inte signerad.");
  if (!b.data.email) return err("Kunden har ingen e-post – ring i stället.");
  if (d.action === "draft") {
    if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
    try { return Response.json(await draftClosing(b, new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }), typeof d.hint === "string" ? d.hint : "")); }
    catch (e) { return err((e as Error).message, 502); }
  }
  if (d.action === "send") {
    const subject = typeof d.subject === "string" ? d.subject.trim().slice(0, 160) : "";
    const body = typeof d.body === "string" ? d.body.trim().slice(0, 4000) : "";
    if (!subject || !body) return err("Ämne och text behövs.");
    if (!mailConfigured()) return err("E-post är inte inställd.", 503);
    try { await send(b.data.email, personalOfferEmail(b, subject, body, `${SITE}/signera?t=${b.token}`), COMPANY_TO, { fromName: "FX Flytt" }); }
    catch (e) { return err("Kunde inte skicka: " + (e as Error).message, 502); }
    b.closings = [...(b.closings || []), { at: Date.now(), subject, by: u.name }].slice(-10);
    await saveBooking(b, `Personligt mejl skickat: "${subject}"`, u.name);
    return Response.json(b);
  }
  return err("Okänd åtgärd.");
}
