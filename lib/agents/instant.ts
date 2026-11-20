// Elsa answers every new request from the website at once (speed to lead): a personal e-mail written from what the
// customer filled in, instead of the standard receipt, and/or a short SMS within a minute. Both only if the owner
// turned them on (Inställningar → AI-teamet). If anything fails, the customer gets the standard receipt as before.
import { askJson, MODEL_WRITE, HOUSE_RULES, quote, aiConfigured, type JsonSchema } from "./claude.ts";
import { REPLY_RULES } from "./inbox.ts";
import { estimate, estimateText } from "./estimate.ts";
import { knowledge } from "./knowledge.ts";
import { getPrices } from "../pricing/current.ts";
import { teamMail, teamSms } from "./outbox.ts";
import { getSettings } from "../booking/settings.ts";
import { getBooking, saveBooking, type Booking } from "../booking/store.ts";
import { send, mailConfigured, COMPANY_TO } from "../mail/send.ts";
import { customerConfirmation } from "../mail/offerEmail.ts";
import { sendSms, smsConfigured, mobileE164, smsFooter } from "../sms/send.ts";
import { AGENTS, agentName, aiBy, aiSignature, replyLang, textLang, logActivity, takeQuota } from "./team.ts";

/** When the office answers: "i dag" on weekdays before 16, otherwise the next weekday. */
export function nextAnswer(now = new Date()): string {
  const f = new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Stockholm", weekday: "short", hour: "numeric", hour12: false }).formatToParts(now);
  const wd = f.find((p) => p.type === "weekday")!.value, h = Number(f.find((p) => p.type === "hour")!.value);
  const weekend = /lör|sön/.test(wd);
  if (!weekend && h < 16) return "i dag";
  if (/fre|lör|sön/.test(wd) && !(wd.startsWith("fre") && h < 16)) return "på måndag";
  return "i morgon";
}

const SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["subject", "body"], properties: {
  subject: { type: "string", description: "Ämnesrad, t.ex. 'Tack Anna – vi har fått din förfrågan om flytt till Arboga'." },
  body: { type: "string", description: "Mejlet, 50–110 ord, stycken med tom rad emellan, på kundens språk. Ingen hälsning på slutet (läggs till)." },
} };

export function requestContext(b: Booking, when: string): string {
  const d = b.data;
  return [
    `Kund: ${d.name}`, d.from || d.to ? `Flytt: ${d.from || "?"} → ${d.to || "?"}` : "", d.size ? `Tjänst: ${d.size}` : "", d.areaM2 ? `Boyta: ${d.areaM2} m²` : "",
    d.date ? `Önskat datum: ${d.date}${d.dateType ? " (" + d.dateType + ")" : ""}` : "Inget datum angivet", d.floorFrom ? `Våning från: ${d.floorFrom}` : "", d.floorTo ? `Våning till: ${d.floorTo}` : "",
    d.extras?.length ? `Tillval: ${d.extras.join(", ")}` : "", d.price ? `Pris i prisräknaren: ${d.price.total} kr efter RUT` : "Inget pris räknat",
    d.volume ? `Volym: ${d.volume.m3} m³` : "", d.message ? `Kundens meddelande: ${d.message.slice(0, 800)}` : "",
    `Kontoret återkommer med offerten: ${when} (vardagar 8–18)`,
  ].filter(Boolean).join("\n");
}

export async function instantReply(id: string): Promise<void> {
  const s = await getSettings(), b = await getBooking(id);
  if (!b) return;
  const elsa = agentName(s, "elsa"), when = nextAnswer();
  let personal = false;
  if (s.aiAuto.instant && b.data.email && aiConfigured() && mailConfigured() && await takeQuota(s.aiDailyMax)) {
    try {
      // Same knowledge and rules as Elsa's e-mail replies: the website pages, the checklist, and the price engine.
      const P = await getPrices();
      const d = b.data;
      const est = d.price ? null : estimate({ name: d.name, phone: d.phone, from: d.from || "", to: d.to || "", date: d.date || "", size: d.size || "", areaM2: Number(d.areaM2) || 0 }, P, d.message || "");
      const price = d.price ? `Kunden räknade själv i prisräknaren: ${d.price.total} kr efter RUT (gäller om uppgifterna stämmer).` : est ? `PRISFÖRSLAG (prismotorn):\n${estimateText(est)}` : "Inget pris räknat.";
      const r = await askJson<{ subject: string; body: string }>({
        model: MODEL_WRITE, effort: "low", schema: SCHEMA, maxTokens: 6000,
        system: `${HOUSE_RULES}\n\nDu är ${elsa} i kundservice. En kund har just skickat en förfrågan från hemsidan. Skriv ett varmt, personligt svar direkt:
tacka med förnamn, upprepa kort vad kunden vill (sträcka, datum, tjänst) så kunden ser att vi läst, säg när offerten kommer (står i underlaget) och att den
signeras i mobilen. Har kunden räknat ett pris: säg att det är priset efter RUT om uppgifterna stämmer. Fråga bara om det som saknas för en exakt offert.
Lova inget datum eller pris utöver underlaget.\n\n${REPLY_RULES}\n\nFAKTA OM FX FLYTT:\n<foretaget>\n${knowledge(P)}\n</foretaget>`,
        user: quote("underlag", `${requestContext(b, when)}\n${price}`),
      });
      const lang = textLang(String(r.body || "")) === "en" || replyLang(String(r.body || "")) === "en" ? "en" : "sv";
      const body = `${String(r.body || "").trim().replace(/\n*(Vänliga hälsningar|Best regards|Kind regards)[\s\S]*$/i, "")}\n\n${aiSignature(elsa, AGENTS.elsa.role, lang)}`;
      const paras = body.split(/\n{2,}/);
      const esc = (x: string) => x.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
      const sent = await teamMail(b.data.email, { subject: String(r.subject || "Tack för din förfrågan – FX Flytt").slice(0, 140), text: body,
        html: `<!DOCTYPE html><html lang="sv"><body style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:22px;color:#14212b">${paras.map((p) => `<p style="margin:0 0 14px">${esc(p).replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#5b6b78;font-size:13px">FX Flytt AB · 076-300 07 23 · <a href="https://www.fxflytt.se" style="color:#0d2a3f">www.fxflytt.se</a></p></body></html>` },
        COMPANY_TO, { fromName: `${elsa} · FX Flytt` }, s);
      // Test mode: the personal e-mail went to the office, so the customer still gets the standard receipt below.
      personal = !sent.test;
      await saveBooking(b, sent.test ? `TESTLÄGE: ${elsa}s direktsvar gick till kontoret` : `${aiBy(s, "elsa")} skickade ett personligt svar direkt`);
      await logActivity({ agent: "elsa", what: `Svarade ${b.data.name} direkt på förfrågan från hemsidan`, bookingId: b.id, auto: true });
    } catch (e) { console.error("instant reply", (e as Error).message); }
  }
  // No personal e-mail (off, no AI, limit reached or failed): the standard receipt, exactly as before.
  if (!personal && b.data.email && mailConfigured()) {
    try { await send(b.data.email, customerConfirmation(b.data), COMPANY_TO); } catch (e) { console.error("confirmation mail failed", (e as Error).message); }
  }
  if (s.aiAuto.instantSms && smsConfigured() && mobileE164(b.data.phone) && await takeQuota(s.aiDailyMax)) {
    const first = (b.data.name.split(/\s+/)[0] || "").slice(0, 30);
    const text = `Hej ${first}! Tack för din förfrågan till FX Flytt. Du får din offert ${when} och kan signera den direkt i mobilen.\n${smsFooter}`;
    try {
      if ((await teamSms(b.data.phone, text, s)).test) { await saveBooking(b, `TESTLÄGE: ${elsa}s SMS gick inte till kunden`); return; }
      const fresh = (await getBooking(b.id)) || b;
      fresh.sms = [...(fresh.sms || []), { at: Date.now(), by: aiBy(s, "elsa"), text, auto: true }];
      await saveBooking(fresh, `${aiBy(s, "elsa")} skickade SMS direkt: tack för förfrågan`);
      await logActivity({ agent: "elsa", what: `Skickade SMS direkt till ${b.data.name}`, bookingId: b.id, auto: true });
    } catch (e) { console.error("instant sms", (e as Error).message); }
  }
}

/** Whether a new web request should be answered by instantReply (so /api/offer skips its own receipt). */
export async function instantOn(): Promise<boolean> {
  const s = await getSettings();
  return s.aiAuto.instant || s.aiAuto.instantSms;
}
