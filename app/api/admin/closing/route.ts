// Admin: Oskar, the AI salesman.
//   GET                                          → { list: customers worth an e-mail today, best first, with kind and why }
//   POST ?id= {action:"draft", kind, hint}       Oskar writes the e-mail → { subject, body, tip }
//   POST ?id= {action:"send", kind, subject, body}   e-mail it to the customer (sent by the person pressing Skicka)
//   POST ?id= {action:"script"}                  a call script for this customer
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getBooking, listBookings } from "@/lib/booking/store.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { mailConfigured } from "@/lib/mail/send.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { draftSales, draftSms, salesCandidates, callScript, SALES_KINDS, type SalesKind } from "@/lib/agents/sales.ts";
import { smsConfigured, mobileE164 } from "@/lib/sms/send.ts";
import { sendSales, sendSalesSms } from "@/lib/agents/run.ts";
import { agentName, logActivity } from "@/lib/agents/team.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const list = salesCandidates(await listBookings(2000)).slice(0, 40).map(({ b, score, kind, why, channel }) => ({
    id: b.id, name: b.data.name, total: b.offer?.total || 0, views: b.views || 0, lastViewAt: b.lastViewAt, sentAt: b.sentAt, date: b.date, score, kind, why, channel }));
  return Response.json({ list, kinds: SALES_KINDS, ai: aiConfigured(), sms: smsConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return err("Hittar inte kunden.", 404);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const s = await getSettings();
  if (d.action === "script") {
    if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
    try { const r = await callScript(b, today()); await logActivity({ agent: "oskar", what: `Skrev ringmanus för ${b.data.name} åt ${u.name}`, bookingId: b.id }); return Response.json(r); }
    catch (e) { return err((e as Error).message, 502); }
  }
  const kind = (typeof d.kind === "string" && d.kind in SALES_KINDS ? d.kind : "followup") as SalesKind;
  const sms = d.channel === "sms";
  if (sms && !smsConfigured()) return err("SMS är inte inställt (ELKS_API_USER / ELKS_API_PASSWORD i Vercel).", 503);
  if (sms && !mobileE164(b.data.phone)) return err("Kunden har inget mobilnummer.");
  if (sms && kind !== "followup" && kind !== "revive") return err("SMS används bara för att följa upp offerter.");
  if (!sms && !b.data.email) return err("Kunden har ingen e-post – skicka SMS eller ring.");
  if ((kind === "followup" || kind === "revive") && (b.status !== "sent" || !b.token)) return err("Offerten måste vara skickad och inte signerad.");
  if (kind === "upsell" && b.status !== "signed") return err("Merförsäljning gäller bokade flyttar.");
  if (kind === "winback" && b.status !== "declined") return err("Kunden har inte tackat nej.");
  if (d.action === "draft" && sms) {
    if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
    try { return Response.json({ text: await draftSms(kind, b, today(), { hint: typeof d.hint === "string" ? d.hint : "", name: agentName(s, "oskar") }) }); }
    catch (e) { return err((e as Error).message, 502); }
  }
  if (d.action === "send" && sms) {
    const text = typeof d.text === "string" ? d.text.trim().slice(0, 220) : "";
    if (!text) return err("Skriv SMS:et först.");
    try { await sendSalesSms(kind, b, text, u.name); } catch (e) { return err("Kunde inte skicka SMS: " + (e as Error).message, 502); }
    return Response.json(b);
  }
  if (d.action === "draft") {
    if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
    try {
      const r = await draftSales(kind, b, today(), { hint: typeof d.hint === "string" ? d.hint : "", name: agentName(s, "oskar") });
      await logActivity({ agent: "oskar", what: `Skrev ett mejl (${SALES_KINDS[kind].label.toLowerCase()}) till ${b.data.name} åt ${u.name}`, bookingId: b.id });
      return Response.json(r);
    } catch (e) { return err((e as Error).message, 502); }
  }
  if (d.action === "send") {
    const subject = typeof d.subject === "string" ? d.subject.trim().slice(0, 160) : "";
    const body = typeof d.body === "string" ? d.body.trim().slice(0, 4000) : "";
    if (!subject || !body) return err("Ämne och text behövs.");
    if (!mailConfigured()) return err("E-post är inte inställd.", 503);
    try { await sendSales(kind, b, subject, body, u.name); }
    catch (e) { return err("Kunde inte skicka: " + (e as Error).message, 502); }
    return Response.json(b);
  }
  return err("Okänd åtgärd.");
}
