// POST /api/lead – "Få priset på mejl" in the website calculator.
// The price is computed again on the server with the price list in use, e-mailed to the visitor and
// saved as a lead in the booking system so the office can follow up.
import { computePrice, PriceError } from "@/lib/pricing/pricelist.js";
import { getPrices } from "@/lib/pricing/current.ts";
import { createBooking, saveBooking } from "@/lib/booking/store.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { notifyAll } from "@/lib/booking/push.ts";
import { calcPriceEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const ALLOWED = ["service", "areaM2", "distanceKm", "pkg", "crew", "hours", "boxes", "volumeM3", "extraCleaning"];
const SVC: Record<string, string> = { "move|bas": "Bara flytt – Bas", "move|premium": "Flytt + flyttstäd – Premium, 10 % rabatt", "move|deluxe": "Flytt + flyttstäd + packning – Deluxe, 20 % rabatt", "hourly|": "Flytt per timme", "cleaning|": "Bara flyttstäd" };

export async function POST(req: Request) {
  if (rateLimited("lead:" + clientIp(req), 5, 10 * 60_000)) return Response.json({ error: "För många försök. Ring oss gärna på 076-300 07 23." }, { status: 429 });
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (str(d.website, 100)) return Response.json({ ok: true });   // honeypot
  const name = str(d.name, 120), email = str(d.email, 200).toLowerCase(), phone = str(d.phone, 40);
  if (name.length < 2) return Response.json({ error: "Skriv ditt namn." }, { status: 400 });
  if (!EMAIL_RE.test(email)) return Response.json({ error: "Skriv en giltig e-postadress." }, { status: 400 });
  if (d.consent !== true) return Response.json({ error: "Du behöver godkänna att vi får kontakta dig." }, { status: 400 });
  const raw = (d.input && typeof d.input === "object" ? d.input : {}) as Record<string, unknown>;
  const input = Object.fromEntries(Object.entries(raw).filter(([k]) => ALLOWED.includes(k)));
  let q;
  try { q = computePrice(input as never, await getPrices()); }
  catch (e) { return Response.json({ error: e instanceof PriceError ? e.message : "Kunde inte räkna priset." }, { status: 400 }); }
  if (q.totalAfterRut == null) return Response.json({ error: "Det här priset ges efter offert – fyll i formuläret så hör vi av oss." }, { status: 400 });
  const svc = String(input.service || "move"), label = SVC[svc + "|" + (svc === "move" ? String(input.pkg || "bas") : "")] || "Flytt";
  const price = { total: q.totalAfterRut, lines: q.lines.map((l: { label: string; amount: number }) => ({ label: l.label, amount: l.amount })) };
  const site = process.env.SITE_URL || "https://www.fxflytt.se";
  if (kvConfigured()) {
    try {
      const b = await createBooking("web", {
        name, email, phone, size: label, areaM2: svc === "hourly" ? "" : String(input.areaM2 || ""),
        distanceKm: typeof input.distanceKm === "number" ? Math.round(input.distanceKm) : undefined,
        price: { ...price, version: q.version }, message: "Fick priset på mejl från prisräknaren – har inte skickat någon förfrågan än.",
      }, { lead: "calc" });
      b.history[0].what = "Prisräknaren: fick priset på mejl";
      await saveBooking(b);
      await notifyAll({ title: "💡 Ny lead från prisräknaren", body: `${name} · ${label} · ${q.totalAfterRut.toLocaleString("sv-SE")} kr${phone ? " · " + phone : ""}`, url: "/admin#" + b.id, tag: b.id });
    } catch (e) { console.error("lead save failed", (e as Error).message); }
  }
  if (mailConfigured()) {
    try { await send(email, calcPriceEmail(name, label, price, site + "/#offert"), COMPANY_TO); }
    catch (e) { console.error("lead mail failed", (e as Error).message); return Response.json({ error: "Kunde inte skicka mejlet just nu. Ring oss på 076-300 07 23." }, { status: 502 }); }
  }
  return Response.json({ ok: true, total: q.totalAfterRut });
}
