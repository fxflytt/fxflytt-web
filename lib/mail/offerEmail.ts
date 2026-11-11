// Builds the internal "new quote request" e-mail (HTML + plain text) from the form data.
export type OfferData = {
  name: string;
  phone: string;
  email?: string;
  from?: string;
  to?: string;
  distanceKm?: number;
  size?: string;
  areaM2?: string;
  home?: string;
  date?: string;
  dateType?: string;
  floorFrom?: string;
  floorTo?: string;
  extras?: string[];
  message?: string;
  price?: { total: number; lines: { label: string; amount: number }[]; version?: string };
  volume?: { m3: number; items: number; list: string[] };
};

const NAVY = "#0d2a3f", ACCENT = "#ff7a1a", INK = "#14212b", MUTED = "#5b6b78", LINE = "#e3e8ed", BG = "#f5f7f9";
const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/ /g, " ") + " kr";
const telHref = (p: string) => "tel:" + p.replace(/[^\d+]/g, "").replace(/^0/, "+46");
const fmtDate = (d?: string) => {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d || "";
  return new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
};

function rows(items: [string, string | undefined][]) {
  return items
    .filter(([, v]) => v && String(v).trim())
    .map(([k, v], i, arr) => `
      <tr>
        <td style="padding:10px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${LINE};` : ""}color:${MUTED};font-size:14px;width:42%;vertical-align:top">${esc(k)}</td>
        <td style="padding:10px 0;${i < arr.length - 1 ? `border-bottom:1px solid ${LINE};` : ""}color:${INK};font-size:14px;font-weight:600;vertical-align:top">${esc(v)}</td>
      </tr>`).join("");
}

function section(title: string, body: string) {
  if (!body.trim()) return "";
  return `
  <tr><td style="padding:0 28px 22px">
    <div style="font-size:12px;letter-spacing:1.2px;text-transform:uppercase;color:${ACCENT};font-weight:700;margin:0 0 6px">${esc(title)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse">${body}</table>
  </td></tr>`;
}

export function offerEmail(d: OfferData, sentAt: Date) {
  const when = sentAt.toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "long", timeStyle: "short" });
  const route = [d.from, d.to].filter(Boolean).join(" → ");
  const subject = `Ny offertförfrågan: ${d.name}${route ? " · " + [d.from, d.to].map((a) => (a || "").split(",").pop()!.replace(/\d/g, "").trim()).join(" → ") : ""}`;

  const priceBlock = d.price ? `
  <tr><td style="padding:0 28px 22px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${NAVY};border-radius:12px">
      <tr><td style="padding:18px 20px">
        <div style="color:#b9c7d3;font-size:13px">Pris enligt prisräknaren · efter RUT, inkl. moms</div>
        <div style="color:#fff;font-size:30px;font-weight:800;margin:4px 0 10px">${esc(kr(d.price.total))}</div>
        ${d.price.lines.map((l) => `<div style="color:#dbe4ec;font-size:13px;line-height:20px">${esc(l.label)} <span style="float:right;color:#fff">${esc(kr(l.amount))}</span></div>`).join("")}
        ${d.price.version ? `<div style="color:#8aa0b2;font-size:11px;margin-top:10px">Prislista ${esc(d.price.version)}</div>` : ""}
      </td></tr>
    </table>
  </td></tr>` : "";

  const btn = (href: string, label: string, primary: boolean) =>
    `<a href="${esc(href)}" style="display:inline-block;padding:12px 20px;border-radius:999px;font-size:14px;font-weight:700;text-decoration:none;${primary ? `background:${ACCENT};color:#fff` : `background:#fff;color:${NAVY};border:2px solid ${NAVY}`};margin:0 8px 8px 0">${esc(label)}</a>`;

  const html = `<!DOCTYPE html><html lang="sv"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${BG};font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${BG}"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:600px;background:#fff;border-radius:16px;overflow:hidden;border:1px solid ${LINE}">
  <tr><td style="background:${NAVY};padding:20px 28px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td style="vertical-align:middle">
        <span style="display:inline-block;background:#fff;color:${NAVY};font-weight:900;font-style:italic;font-size:18px;padding:6px 10px;border-radius:8px;border-left:4px solid ${ACCENT}">FX</span>
        <span style="color:#fff;font-size:18px;font-weight:800;margin-left:10px;vertical-align:middle">FX Flytt</span>
      </td>
      <td align="right" style="color:#b9c7d3;font-size:12px;vertical-align:middle">${esc(when)}</td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:26px 28px 6px">
    <div style="display:inline-block;background:#fff1e6;color:#c2560a;font-size:12px;font-weight:700;padding:5px 10px;border-radius:999px">NY OFFERTFÖRFRÅGAN</div>
    <h1 style="margin:12px 0 4px;font-size:24px;color:${INK}">${esc(d.name)}</h1>
    ${route ? `<div style="color:${MUTED};font-size:15px">${esc(route)}${d.distanceKm ? ` · ca ${esc(d.distanceKm)} km` : ""}</div>` : ""}
    <div style="margin:18px 0 18px">
      ${btn(telHref(d.phone), "Ring " + d.phone, true)}
      ${d.email ? btn("mailto:" + d.email + "?subject=" + encodeURIComponent("Din offert från FX Flytt"), "Svara via e-post", false) : ""}
    </div>
  </td></tr>
  ${priceBlock}
  ${section("Kund", rows([["Namn", d.name], ["Telefon", d.phone], ["E-post", d.email]]))}
  ${section("Flytten", rows([
    ["Från", d.from], ["Till", d.to], ["Avstånd", d.distanceKm ? `ca ${d.distanceKm} km` : undefined],
    ["Önskat datum", fmtDate(d.date)], ["Datumtyp", d.dateType],
  ]))}
  ${section("Bostaden", rows([
    ["Boyta", [d.areaM2 ? d.areaM2 + " m²" : "", d.size].filter(Boolean).join(" · ")], ["Bostad", d.home],
    ["Våning (från)", d.floorFrom], ["Våning (till)", d.floorTo],
    ["Tillval", d.extras?.length ? d.extras.join(", ") : undefined],
    ["Volym", d.volume ? `${String(d.volume.m3).replace(".", ",")} m³ · ${d.volume.items} föremål` : undefined],
  ]))}
  ${d.volume?.list?.length ? section("Möbellista", `<tr><td style="font-size:13px;color:${INK};line-height:20px;padding:6px 0">${esc(d.volume.list.join(", "))}</td></tr>`) : ""}
  ${d.message ? section("Meddelande från kunden", `<tr><td style="background:${BG};border-radius:10px;padding:14px;font-size:14px;color:${INK};line-height:21px;white-space:pre-wrap">${esc(d.message)}</td></tr>`) : ""}
  <tr><td style="padding:16px 28px 22px;border-top:1px solid ${LINE};color:${MUTED};font-size:12px;line-height:18px">
    Skickat från offertformuläret på <a href="https://www.fxflytt.se" style="color:${NAVY}">fxflytt.se</a>.
    ${d.email ? "Klicka på <b>Svara</b> för att svara kunden direkt." : "Kunden lämnade ingen e-post – ring kunden."}
  </td></tr>
</table>
<div style="color:#9aa8b4;font-size:11px;padding:14px">FX Flytt AB · Frejgatan 9B, 736 30 Kungsör · 076-300 07 23</div>
</td></tr></table></body></html>`;

  const t = (k: string, v?: string) => (v && v.trim() ? `${k}: ${v}\n` : "");
  const text =
    `NY OFFERTFÖRFRÅGAN – FX Flytt\n${when}\n\n` +
    t("Namn", d.name) + t("Telefon", d.phone) + t("E-post", d.email) + "\n" +
    t("Från", d.from) + t("Till", d.to) + t("Avstånd", d.distanceKm ? `ca ${d.distanceKm} km` : "") +
    t("Önskat datum", fmtDate(d.date)) + t("Datumtyp", d.dateType) + "\n" +
    t("Boyta", [d.areaM2 ? d.areaM2 + " m²" : "", d.size].filter(Boolean).join(" · ")) + t("Bostad", d.home) +
    t("Våning (från)", d.floorFrom) + t("Våning (till)", d.floorTo) + t("Tillval", d.extras?.join(", ")) +
    (d.price ? `\nPris efter RUT: ${kr(d.price.total)}\n` + d.price.lines.map((l) => `  ${l.label}: ${kr(l.amount)}`).join("\n") + "\n" : "") +
    (d.message ? `\nMeddelande:\n${d.message}\n` : "") +
    "\n— Skickat från fxflytt.se";

  return { subject, html, text };
}
