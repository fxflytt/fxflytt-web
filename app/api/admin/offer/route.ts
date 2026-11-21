// Admin: the offer's extras.
//   GET  ?profile=1                     → { profile } my seller profile (shown with the greeting in the offer)
//   POST ?profile=1 {name,title,phone}  → save it;  POST ?profile=1&photo=1 (image body) → upload my photo
//   GET  ?id=&advice=1                  → { advice } Prisråd: similar offers and the chance to win at a few prices
//   GET  ?id=&pdf=1                     → the offer as a PDF file
//   POST ?id= {validUntil}              → change the end date ("" = no end date)
//   POST ?id= {intro: "text"}           → save the greeting;  {intro: null} → remove it;  {introTpl: true} → from the template
//   POST ?id= {introAi: true}           → the AI writes the greeting from the request (not saved – the text comes back to edit)
//   POST ?id= {answer: {qid, text}}     → answer a question from the customer (sent by e-mail, or SMS when there is no e-mail)
//   POST ?id= {photoInOffer: bool}      → show the customer's photos and the AI estimate in the offer, or not
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, listBookings } from "@/lib/booking/store.ts";
import { getSettings, trustView } from "@/lib/booking/settings.ts";
import { getProfile, setProfile, setValidUntil, makeIntro, fillIntro, answerQuestion } from "@/lib/booking/offerplus.ts";
import { priceAdvice } from "@/lib/booking/priceadvice.ts";
import { offerPdf } from "@/lib/booking/offerpdf.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";
import { answerEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";
import { sendSms, smsConfigured, mobileE164 } from "@/lib/sms/send.ts";
import { askJson, MODEL_FAST, aiConfigured, quote, type JsonSchema } from "@/lib/agents/claude.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const display = (u: { name: string }) => (u.name === "Ägaren" ? "" : u.name);

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  if (q.get("profile") === "1") return Response.json({ profile: await getProfile(u.id, display(u)) });
  const b = await getBooking(q.get("id") || "");
  if (!b) return err("not-found", 404);
  if (q.get("advice") === "1") return Response.json({ advice: priceAdvice(b, await listBookings()) });
  if (q.get("pdf") === "1") {
    const pdf = await offerPdf(b, await getSettings().then(trustView).catch(() => null));
    return new Response(new Uint8Array(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="FX-Flytt-offert-${b.id}.pdf"`, "Cache-Control": "no-store" } });
  }
  return err("Okänd fråga.");
}

const INTRO_SCHEMA: JsonSchema = { type: "object", additionalProperties: false, required: ["text"], properties: { text: { type: "string" } } };

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams;
  if (q.get("profile") === "1") {
    try {
      if (q.get("photo") === "1") {
        const buf = new Uint8Array(await req.arrayBuffer());
        if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.");
        const url = await storePhoto("profil", buf);
        return Response.json({ profile: await setProfile(u.id, { photo: url }, display(u)) });
      }
      const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
      return Response.json({ profile: await setProfile(u.id, d, display(u)) });
    } catch (e) { return err((e as Error).message); }
  }
  const b = await getBooking(q.get("id") || "");
  if (!b) return err("not-found", 404);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if ("validUntil" in d) {
      if (b.status === "signed" || b.status === "done") return err("Offerten är redan signerad.");
      const what = setValidUntil(b, d.validUntil);
      await saveBooking(b, what, u.name);
      return Response.json({ booking: b });
    }
    if ("photoInOffer" in d) {
      b.photoInOffer = d.photoInOffer === false ? false : undefined;
      await saveBooking(b, d.photoInOffer === false ? "Bilderna visas inte i offerten" : "Bilderna visas i offerten", u.name);
      return Response.json({ booking: b });
    }
    if ("intro" in d || d.introTpl === true) {
      const p = await getProfile(u.id, display(u)), name = p.name || display(u) || "FX Flytt";
      if (d.intro === null) { b.intro = undefined; await saveBooking(b, "Personligt meddelande borttaget", u.name); return Response.json({ booking: b }); }
      const text = d.introTpl === true ? fillIntro((await getSettings()).introTpl, b, name) : String(d.intro || "");
      b.intro = makeIntro(text, u.id, p, name);
      await saveBooking(b, "Personligt meddelande sparat", u.name);
      return Response.json({ booking: b });
    }
    if (d.introAi === true) {
      if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY saknas i Vercel).", 503);
      const p = await getProfile(u.id, display(u)), name = p.name || display(u) || "FX Flytt";
      const x = b.data, ai = b.photoAi && !b.photoAi.error ? b.photoAi : null;
      const facts = [
        `Kund: ${x.name}`, x.from && `Från: ${x.from}`, x.to && `Till: ${x.to}`, b.date && `Datum: ${b.date}`, x.size && `Tjänst: ${x.size}`,
        x.areaM2 && `Boyta: ${x.areaM2} m²`, x.home && `Bostad: ${x.home}`, x.floorFrom && `Våning från: ${x.floorFrom}`, x.floorTo && `Våning till: ${x.floorTo}`,
        (x.extras || []).length && `Önskemål: ${(x.extras || []).join(", ")}`, x.message && `Kundens meddelande: ${x.message}`,
        ai && `Från kundens bilder: ca ${ai.m3} m³; tunga saker: ${ai.heavy.join(", ") || "inga"}; ömtåligt: ${ai.fragile.join(", ") || "inget"}`,
        b.offer && `Pris efter RUT: ${b.offer.total} kr`,
      ].filter(Boolean).join("\n");
      const r = await askJson<{ text: string }>({
        model: MODEL_FAST, effort: "low", schema: INTRO_SCHEMA, maxTokens: 800,
        system: `Du skriver en kort personlig hälsning som står överst i en offert från FX Flytt AB (flyttfirma i Mälardalen). Den är skriven av säljaren ${name} till kunden.
Svenska, varm men saklig, du-form, 2–4 meningar, högst 60 ord. Börja med "Hej <förnamn>!" på egen rad. Nämn en eller två konkreta saker från förfrågan
(t.ex. sträckan, ett piano, våning utan hiss, datumet) så att kunden ser att vi har läst den. Avsluta med att kunden kan ringa eller skriva en fråga i offerten.
Hitta inte på något som inte står i underlaget. Inga priser, inga löften om rabatt, ingen hälsningsfras med namn på slutet (namnet visas under texten).`,
        user: quote("forfragan", facts),
      });
      const text = String(r.text || "").replace(/[<>]/g, "").trim().slice(0, 800);
      if (text.length < 10) return err("AI:n kunde inte skriva ett meddelande – försök igen.", 502);
      return Response.json({ text });
    }
    if (d.answer && typeof d.answer === "object") {
      const a = d.answer as { qid?: unknown; text?: unknown };
      const p = await getProfile(u.id, display(u)), by = p.name || display(u) || "FX Flytt";
      const x = answerQuestion(b, a.qid, a.text, by);
      const url = b.token ? `${SITE}/signera?t=${b.token}` : "";
      let via = "";
      if (b.data.email && mailConfigured()) {
        try { await send(b.data.email, answerEmail(b, x, url), COMPANY_TO); via = "e-post"; } catch (e) { console.error("answer mail", e); }
      }
      if (!via && b.data.phone && smsConfigured() && mobileE164(b.data.phone)) {
        const first = b.data.name.split(" ")[0];
        const msg = `Hej ${first}! Vi har svarat på din fråga om offerten${url ? ": " + url : "."} /${by}, FX Flytt`;
        try { await sendSms(b.data.phone, msg); via = "SMS"; b.sms = [...(b.sms || []), { at: Date.now(), by: u.name, text: msg }]; } catch (e) { console.error("answer sms", e); }
      }
      x.via = via || undefined;
      await saveBooking(b, `Svarade på kundens fråga${via ? " (skickat via " + via + ")" : " (syns i offerten)"}`, u.name);
      return Response.json({ booking: b, via });
    }
  } catch (e) { return err((e as Error).message); }
  return err("Okänd åtgärd.");
}
