// E-mails for the booking flow: offer link to the customer, and confirmations after signing.
import { DECLINE_REASONS, type Booking } from "../booking/store.ts";

const NAVY = "#0d2a3f", ACCENT = "#ff7a1a", INK = "#14212b", MUTED = "#5b6b78", LINE = "#e3e8ed", BG = "#f5f7f9", GREEN = "#1f8a4c";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/\u00a0| /g, " ") + " kr";
export const fmtDate = (d?: string) =>
  d && /^\d{4}-\d{2}-\d{2}$/.test(d)
    ? new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    : "Enligt överenskommelse";
const telHref = (p: string) => "tel:" + p.replace(/[^\d+]/g, "").replace(/^0/, "+46");

function shell(title: string, badge: { text: string; bg: string; fg: string }, inner: string) {
  return `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${NAVY};padding:20px 28px">
    <span style="display:inline-block;background:#fff;color:${NAVY};font-weight:900;font-style:italic;font-size:18px;padding:6px 10px;border-radius:8px;border-left:4px solid ${ACCENT}">FX</span>
    <span style="color:#fff;font-size:18px;font-weight:800;margin-left:10px;vertical-align:middle;white-space:nowrap">FX&nbsp;Flytt</span>
  </td></tr>
  <tr><td style="padding:26px 28px 8px">
    <div style="display:inline-block;background:${badge.bg};color:${badge.fg};font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px">${esc(badge.text)}</div>
  </td></tr>
  ${inner}
  <tr><td style="padding:16px 28px 22px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:18px">
    Frågor? Ring <a href="tel:+46763000723" style="color:${NAVY}">076-300 07 23</a> eller svara på det här mejlet.
    <a href="https://www.fxflytt.se/villkor" style="color:${NAVY}">Villkor</a>
  </td></tr>
</table>
<div style="color:#9aa8b4;font-size:11px;padding:14px">FX Flytt AB · Frejgatan 9B, 736 30 Kungsör · 076-300 07 23 · info@fxflytt.se</div>
</td></tr></table></body></html>`;
}

const p = (html: string) => `<tr><td style="padding:6px 28px;color:${INK};font-size:15px;line-height:23px">${html}</td></tr>`;
const button = (href: string, label: string) =>
  `<tr><td style="padding:14px 28px 18px"><a href="${esc(href)}" style="display:inline-block;padding:15px 26px;border-radius:999px;background:${ACCENT};color:#fff;font-size:16px;font-weight:800;text-decoration:none">${esc(label)}</a></td></tr>`;

const chosenExtras = (b: Booking) => (b.extras || []).filter((e) => b.extrasChosen?.includes(e.id));

function summary(b: Booking) {
  const d = b.data;
  const rows: [string, string | undefined][] = [
    ["Datum", fmtDate(b.date) + (b.time ? ` kl. ${b.time}` : "")],
    ["Tjänst", d.size], ["Från", d.from], ["Till", d.to], ["Boyta", d.areaM2 ? d.areaM2 + " m²" : undefined],
    ["Tillval", chosenExtras(b).map((e) => `${e.label} (+${kr(e.price)})`).join(", ") || undefined],
  ];
  const r = rows.filter(([, v]) => v && String(v).trim())
    .map(([k, v]) => `<tr><td style="padding:7px 0;color:${MUTED};font-size:14px;width:38%;border-bottom:1px solid ${LINE}">${esc(k)}</td><td style="padding:7px 0;color:${INK};font-size:14px;font-weight:600;border-bottom:1px solid ${LINE}">${esc(v)}</td></tr>`).join("");
  const o = b.offer;
  const price = o ? `<div style="background:${BG};border-radius:12px;padding:16px 18px;margin-top:14px">
      <div style="color:${MUTED};font-size:13px">Pris efter RUT, inkl. moms</div>
      ${b.discount ? `<div style="color:${MUTED};font-size:15px;text-decoration:line-through">${esc(kr(b.discount.before + chosenExtras(b).reduce((a, e) => a + e.price, 0)))}</div>` : ""}
      <div style="color:${INK};font-size:28px;font-weight:800">${esc(kr(o.total))}${b.discount ? ` <span style="font-size:14px;color:${GREEN};font-weight:700">−${b.discount.pct} %</span>` : ""}</div>
      ${o.customerNote ? `<div style="color:${INK};font-size:14px;margin-top:6px">${esc(o.customerNote)}</div>` : ""}
    </div>` : "";
  return `<tr><td style="padding:8px 28px 6px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${r}</table>${price}</td></tr>`;
}

export function offerLinkEmail(b: Booking, url: string) {
  const subject = `Din offert från FX Flytt – ${b.id}`;
  const html = shell(subject, { text: "DIN OFFERT", bg: "#fff1e6", fg: "#c2560a" },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Hej ${esc(b.data.name.split(" ")[0])}!</h1></td></tr>` +
    p("Här är din offert för flytten. Öppna den, kontrollera uppgifterna och signera direkt i mobilen – då är flytten bokad.") +
    summary(b) + button(url, "Se och signera offerten") +
    p(`<span style="color:${MUTED};font-size:13px">Länken är personlig. Priset efter RUT gäller om du har rätt till RUT-avdrag och utrymme kvar för året.</span>`));
  const text = `Hej ${b.data.name}!\n\nHär är din offert från FX Flytt (${b.id}).\nDatum: ${fmtDate(b.date)}\nPris efter RUT: ${b.offer ? kr(b.offer.total) : "–"}\n\nSe och signera offerten här:\n${url}\n\nFrågor? Ring 076-300 07 23.\nFX Flytt AB`;
  return { subject, html, text };
}

export function signedCustomerEmail(b: Booking) {
  const subject = `Bokningsbekräftelse – FX Flytt ${b.id}`;
  const when = new Date(b.signedAt!).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short" });
  const html = shell(subject, { text: "BOKNINGEN ÄR KLAR", bg: "#e6f5ec", fg: GREEN },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Tack ${esc(b.data.name.split(" ")[0])} – din flytt är bokad!</h1></td></tr>` +
    p(`Du signerade offerten ${esc(when)}. Vi hör av oss innan flyttdagen och bekräftar tiden.`) + summary(b) +
    p(`<span style="color:${MUTED};font-size:13px">Ändra datum eller avboka kostnadsfritt fram till 6 dagar före flyttdagen. Bokningsnummer: ${esc(b.id)}.</span>`));
  const text = `Tack ${b.data.name}! Din flytt är bokad (${b.id}).\nDatum: ${fmtDate(b.date)}${b.time ? " kl. " + b.time : ""}\nPris efter RUT: ${b.offer ? kr(b.offer.total) : "–"}\nSignerad: ${when}\n\nÄndra datum eller avboka kostnadsfritt fram till 6 dagar före flyttdagen.\nFX Flytt AB · 076-300 07 23`;
  return { subject, html, text };
}

export function companyNoticeEmail(b: Booking, kind: "signed" | "declined", adminUrl: string) {
  const signed = kind === "signed";
  const subject = `${signed ? "SIGNERAD" : "NEKAD"}: ${b.data.name} · ${fmtDate(b.date)}${b.offer ? " · " + kr(b.offer.total) : ""}`;
  const html = shell(subject, signed ? { text: "OFFERT SIGNERAD – NY BOKNING", bg: "#e6f5ec", fg: GREEN } : { text: "KUNDEN NEKADE OFFERTEN", bg: "#fdecec", fg: "#b42318" },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">${esc(b.data.name)}</h1></td></tr>` +
    p(`<a href="${esc(telHref(b.data.phone))}" style="color:${NAVY};font-weight:700">${esc(b.data.phone)}</a>${b.data.email ? " · " + esc(b.data.email) : ""}`) +
    summary(b) +
    (!signed && b.decline ? p(`<b>Anledning:</b> ${esc(DECLINE_REASONS[b.decline.reason] || b.decline.reason)}${b.decline.text ? ` – "${esc(b.decline.text)}"` : ""}${b.decline.reason === "price" ? `<br><span style="color:${MUTED};font-size:13px">Tips: öppna bokningen och skicka ett nytt pris med rabatt.</span>` : ""}`) : "") +
    (signed && b.signature ? p(`<span style="color:${MUTED};font-size:13px">Signerad av "${esc(b.signature.name)}"${b.signature.pnr ? ` · Personnr ${esc(b.signature.pnr)}` : ""}${b.signature.orgnr ? ` · Org.nr ${esc(b.signature.orgnr)} (företag)` : ""} ${esc(new Date(b.signature.at).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }))} · IP ${esc(b.signature.ip)}</span>`) : "") +
    button(adminUrl, "Öppna i bokningssystemet"));
  const why = !signed && b.decline ? `\nAnledning: ${DECLINE_REASONS[b.decline.reason] || b.decline.reason}${b.decline.text ? " – " + b.decline.text : ""}` : "";
  const text = `${signed ? "SIGNERAD" : "NEKAD"}: ${b.data.name} (${b.data.phone})\n${fmtDate(b.date)}${why}\n${adminUrl}`;
  return { subject, html, text };
}

export function reminderEmail(b: Booking, url: string, n: number) {
  const first = b.data.name.split(" ")[0];
  const subject = n >= 2 ? `Sista påminnelsen: din offert från FX Flytt – ${b.id}` : `Påminnelse: din offert från FX Flytt – ${b.id}`;
  const html = shell(subject, { text: "PÅMINNELSE", bg: "#fff1e6", fg: "#c2560a" },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Hej ${esc(first)}!</h1></td></tr>` +
    p(n >= 2
      ? "Vi vill bara påminna om din offert. Vill du boka flytten räcker det att öppna offerten och signera i mobilen – det tar en minut."
      : "Har du hunnit titta på din offert? Öppna den, kontrollera uppgifterna och signera direkt i mobilen – då är flytten bokad.") +
    summary(b) + button(url, "Se och signera offerten") +
    p(`<span style="color:${MUTED};font-size:13px">Har du frågor eller vill ändra något? Ring oss eller svara på det här mejlet. Vill du inte ha offerten kan du tacka nej via länken.</span>`));
  const text = `Hej ${b.data.name}!\n\nEn påminnelse om din offert från FX Flytt (${b.id}).\nDatum: ${fmtDate(b.date)}\nPris efter RUT: ${b.offer ? kr(b.offer.total) : "–"}\n\nSe och signera här:\n${url}\n\nFrågor? Ring 076-300 07 23.\nFX Flytt AB`;
  return { subject, html, text };
}

export function discountEmail(b: Booking, url: string) {
  const first = b.data.name.split(" ")[0];
  const pct = b.discount?.pct || 0;
  const subject = `Nytt pris på din flytt – ${pct} % rabatt · FX Flytt`;
  const html = shell(subject, { text: `NYTT PRIS – ${pct} % RABATT`, bg: "#e6f5ec", fg: GREEN },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Hej ${esc(first)}!</h1></td></tr>` +
    p(`Tack för ditt svar. Vi vill gärna hjälpa dig med flytten och har sänkt priset med ${pct} %. Öppna offerten och signera i mobilen om du vill boka.`) +
    summary(b) + button(url, "Se det nya priset och signera") +
    p(`<span style="color:${MUTED};font-size:13px">Priset efter RUT gäller om du har rätt till RUT-avdrag och utrymme kvar för året.</span>`));
  const text = `Hej ${b.data.name}!\n\nVi har sänkt priset på din flytt med ${pct} %.\nNytt pris efter RUT: ${b.offer ? kr(b.offer.total) : "–"}${b.discount ? " (tidigare " + kr(b.discount.before) + ")" : ""}\nDatum: ${fmtDate(b.date)}\n\nSe och signera här:\n${url}\n\nFX Flytt AB · 076-300 07 23`;
  return { subject, html, text };
}

export function reviewEmail(b: Booking, reviewUrl: string) {
  const first = b.data.name.split(" ")[0];
  const subject = "Tack för att du flyttade med FX Flytt!";
  const html = shell(subject, { text: "TACK", bg: "#e6f5ec", fg: GREEN },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Tack ${esc(first)}!</h1></td></tr>` +
    p("Vi hoppas att flytten gick bra och att du har kommit på plats i ditt nya hem.") +
    p("Vi är ett litet företag och dina ord betyder mycket – både för oss och för andra som letar efter en flyttfirma. Har du en minut över? Skriv gärna vad du tyckte på Google.") +
    button(reviewUrl, "★ Skriv ett omdöme på Google") +
    p(`<span style="color:${MUTED};font-size:13px">Var det något som inte blev bra? Svara på det här mejlet eller ring oss på 076-300 07 23 – vi vill gärna veta och ställa det till rätta.</span>`));
  const text = `Tack ${first}!\n\nVi hoppas att flytten gick bra. Har du en minut över? Skriv gärna ett omdöme på Google:\n${reviewUrl}\n\nVar något inte bra? Svara på mejlet eller ring 076-300 07 23.\nFX Flytt AB`;
  return { subject, html, text };
}

export function boxesReminderEmail(b: Booking) {
  const first = b.data.name.split(" ")[0], bx = b.boxes!, left = bx.qty - bx.returned;
  const subject = `Dags att lämna tillbaka flyttkartongerna – ${b.id}`;
  const html = shell(subject, { text: "KARTONGER", bg: "#fff1e6", fg: "#c2560a" },
    `<tr><td style="padding:10px 28px 0"><h1 style="margin:0;font-size:24px;color:${INK}">Hej ${esc(first)}!</h1></td></tr>` +
    p(`Vi hoppas att du har kommit i ordning i ditt nya hem. Du hyr <b>${left} flyttkartonger</b> av oss som ska vara tillbaka senast <b>${esc(fmtDate(bx.dueDate))}</b>.`) +
    p("Svara på det här mejlet eller ring oss så bestämmer vi en tid när vi hämtar dem – eller om du hellre vill köpa dem.") +
    p(`<span style="color:${MUTED};font-size:13px">Ring oss på 076-300 07 23. Bokning ${esc(b.id)}.</span>`));
  const text = `Hej ${first}!\n\nDu hyr ${left} flyttkartonger av FX Flytt som ska vara tillbaka senast ${fmtDate(bx.dueDate)}.\nSvara på mejlet eller ring 076-300 07 23 så bestämmer vi en tid när vi hämtar dem.\n\nFX Flytt AB (${b.id})`;
  return { subject, html, text };
}
