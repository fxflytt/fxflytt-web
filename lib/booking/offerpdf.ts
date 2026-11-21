// The offer as a PDF file (A4): for the customer to save, print or show someone else, and for the office.
// Built with pdf-lib and the standard Helvetica font (no font files needed). Swedish letters work; characters
// the font cannot draw (emoji, arrows …) are replaced.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Booking } from "./store.ts";

const NAVY = rgb(13 / 255, 42 / 255, 63 / 255), ACCENT = rgb(1, 122 / 255, 26 / 255), INK = rgb(20 / 255, 33 / 255, 43 / 255);
const MUTED = rgb(93 / 255, 109 / 255, 122 / 255), LINE = rgb(226 / 255, 232 / 255, 238 / 255), SOFT = rgb(243 / 255, 246 / 255, 249 / 255), GREEN = rgb(31 / 255, 138 / 255, 76 / 255);
const W = 595.28, H = 841.89, M = 48;

// WinAnsi (what the standard fonts can draw): Latin-1 plus a few typographic characters.
const EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const MAP: Record<string, string> = { "→": "->", "≈": "ca ", "✓": "", "✔": "", "×": "x", "−": "-", " ": " ", " ": " ", " ": " " };
export const pdfSafe = (s: unknown) => [...String(s ?? "")].map((c) => MAP[c] ?? ((c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 255 && !(c.charCodeAt(0) >= 127 && c.charCodeAt(0) < 160)) || EXTRA.includes(c) ? c : c === "\n" ? "\n" : "")).join("");
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/\s/g, " ") + " kr";
const fmtDate = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}$/.test(d) ? new Date(d + "T12:00:00Z").toLocaleDateString("sv-SE", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }) : "Enligt överenskommelse");
const shortDate = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export type PdfTrust = { orgNr?: string; fskatt?: boolean; insured?: boolean; insurer?: string } | null;

export async function offerPdf(b: Booking, trust: PdfTrust): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  doc.setTitle(pdfSafe(`Offert ${b.id} – FX Flytt`)); doc.setAuthor("FX Flytt AB"); doc.setCreator("FX Flytt"); doc.setProducer("FX Flytt");
  doc.setCreationDate(new Date());
  const f = await doc.embedFont(StandardFonts.Helvetica), fb = await doc.embedFont(StandardFonts.HelveticaBold);
  let logo: Awaited<ReturnType<PDFDocument["embedPng"]>> | null = null;
  try { logo = await doc.embedPng(await readFile(path.join(process.cwd(), "public", "icon-192.png"))); } catch { logo = null; }

  let page: PDFPage = doc.addPage([W, H]), y = H;
  const text = (s: string, x: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) =>
    page.drawText(pdfSafe(s), { x, y: yy, size: o.size || 10, font: o.font || f, color: o.color || INK });
  const width = (s: string, size = 10, font = f) => font.widthOfTextAtSize(pdfSafe(s), size);
  const right = (s: string, xr: number, yy: number, o: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb> } = {}) => text(s, xr - width(s, o.size || 10, o.font || f), yy, o);
  const wrap = (s: string, max: number, size = 10, font = f) => {
    const out: string[] = [];
    for (const para of pdfSafe(s).split("\n")) {
      let line = "";
      for (const w of para.split(/\s+/)) { const t = line ? line + " " + w : w; if (font.widthOfTextAtSize(t, size) > max && line) { out.push(line); line = w; } else line = t; }
      out.push(line);
    }
    return out;
  };
  const footer = () => {
    page.drawLine({ start: { x: M, y: 42 }, end: { x: W - M, y: 42 }, thickness: 0.5, color: LINE });
    const t = ["FX Flytt AB", trust?.orgNr ? "Org.nr " + trust.orgNr : "", trust?.fskatt ? "Godkänd för F-skatt" : "", "Drottninggatan 1, 736 31 Kungsör", "076-300 07 23", "info@fxflytt.se", "fxflytt.se"].filter(Boolean).join("  ·  ");
    text(t, M, 30, { size: 7.5, color: MUTED });
    right(`Sida ${doc.getPageCount()}`, W - M, 18, { size: 7.5, color: MUTED });
  };
  const need = (h: number) => { if (y - h < 60) { footer(); page = doc.addPage([W, H]); y = H - M; } };
  const heading = (s: string) => { need(34); y -= 22; text(s, M, y, { size: 12, font: fb, color: NAVY }); y -= 8; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE }); y -= 4; };
  const row = (k: string, v: string) => {
    const lines = wrap(v, W - M * 2 - 140, 10);
    need(14 * lines.length + 4); y -= 14;
    text(k, M, y, { color: MUTED });
    lines.forEach((l, i) => text(l, M + 140, y - i * 13));
    y -= (lines.length - 1) * 13;
  };
  const para = (s: string, o: { size?: number; color?: ReturnType<typeof rgb>; font?: PDFFont } = {}) => {
    for (const l of wrap(s, W - M * 2, o.size || 10, o.font || f)) { need(14); y -= (o.size || 10) + 4; text(l, M, y, o); }
  };

  // Header band
  page.drawRectangle({ x: 0, y: H - 96, width: W, height: 96, color: NAVY });
  if (logo) page.drawImage(logo, { x: M, y: H - 78, width: 56, height: 56 });
  text("FX Flytt", M + (logo ? 68 : 0), H - 46, { size: 22, font: fb, color: rgb(1, 1, 1) });
  text("Flytt · Flyttstäd · Packning · Magasinering", M + (logo ? 68 : 0), H - 64, { size: 9, color: rgb(0.75, 0.82, 0.88) });
  const signed = b.status === "signed" || b.status === "done";
  right(signed ? "BOKNINGSBEKRÄFTELSE" : "OFFERT", W - M, H - 44, { size: 16, font: fb, color: ACCENT });
  right(b.id, W - M, H - 60, { size: 9, color: rgb(0.85, 0.9, 0.94) });
  right("Datum " + shortDate(b.sentAt || b.createdAt), W - M, H - 73, { size: 9, color: rgb(0.85, 0.9, 0.94) });
  y = H - 96 - 18;

  // Customer + validity
  const d = b.data;
  text("Till", M, y - 10, { size: 8, color: MUTED });
  text(d.name || "", M, y - 24, { size: 12, font: fb });
  let yy = y - 38;
  for (const l of [d.phone, d.email].filter(Boolean) as string[]) { text(l, M, yy, { size: 9.5, color: MUTED }); yy -= 13; }
  if (!signed && b.validUntil) {
    page.drawRectangle({ x: W - M - 190, y: y - 46, width: 190, height: 40, color: SOFT, borderColor: LINE, borderWidth: 0.6 });
    text("Offerten gäller till och med", W - M - 180, y - 20, { size: 8.5, color: MUTED });
    text(fmtDate(b.validUntil), W - M - 180, y - 36, { size: 10.5, font: fb, color: NAVY });
  }
  if (signed && b.signature) {
    page.drawRectangle({ x: W - M - 190, y: y - 46, width: 190, height: 40, color: rgb(0.9, 0.96, 0.93), borderColor: GREEN, borderWidth: 0.6 });
    text("Signerad digitalt", W - M - 180, y - 20, { size: 8.5, color: GREEN });
    text(`${b.signature.name}, ${shortDate(b.signature.at)}`, W - M - 180, y - 36, { size: 10, font: fb, color: INK });
  }
  y = Math.min(yy, y - 52);

  if (b.intro?.text) {
    const lines = wrap(b.intro.text, W - M * 2 - 24, 10);
    const h = lines.length * 13 + 30;
    need(h + 10); y -= 8;
    page.drawRectangle({ x: M, y: y - h, width: W - M * 2, height: h, color: SOFT });
    page.drawRectangle({ x: M, y: y - h, width: 3, height: h, color: ACCENT });
    lines.forEach((l, i) => text(l, M + 14, y - 16 - i * 13));
    text(`${b.intro.name}${b.intro.title ? ", " + b.intro.title : ""}${b.intro.phone ? " · " + b.intro.phone : ""}`, M + 14, y - h + 9, { size: 9, font: fb, color: NAVY });
    y -= h;
  }

  heading("Uppdraget");
  row("Datum", fmtDate(b.date || d.date) + (b.time ? " kl. " + b.time : ""));
  row("Tjänst", d.size || "");
  if (d.from) row("Från", d.from);
  if (d.to) row("Till", d.to);
  if (d.distanceKm) row("Avstånd", "ca " + d.distanceKm + " km");
  if (d.areaM2) row("Boyta", d.areaM2 + " m²");
  if (d.home) row("Bostad", d.home);
  if (d.floorFrom) row("Våning (från)", d.floorFrom);
  if (d.floorTo) row("Våning (till)", d.floorTo);
  if (b.photoInOffer !== false && b.photoAi && !b.photoAi.error) row("Volym", `ca ${b.photoAi.m3} m³ (uppskattat från dina bilder)`);

  heading("Pris");
  const o = b.offer;
  if (o) {
    const lines = o.custom ? [] : o.lines;
    for (const l of lines) { need(16); y -= 15; text(l.label, M, y, { size: 10 }); right(kr(l.amount), W - M, y, { size: 10 }); }
    if (o.customerNote) para(o.customerNote, { size: 9.5, color: MUTED });
    need(40); y -= 10;
    page.drawRectangle({ x: M, y: y - 28, width: W - M * 2, height: 30, color: NAVY });
    text("Att betala efter RUT-avdrag, inkl. moms", M + 12, y - 18, { size: 10.5, font: fb, color: rgb(1, 1, 1) });
    right(kr(o.total), W - M - 12, y - 18, { size: 13, font: fb, color: rgb(1, 1, 1) });
    y -= 30;
    if (b.discount) { y -= 12; text(`Ordinarie pris ${kr(b.discount.before)} – du får ${b.discount.pct} % rabatt.`, M, y, { size: 9, color: GREEN }); }
    if (o.note) para(o.note, { size: 9, color: MUTED });
    if ((o.notIncluded || []).length) { para("Ingår inte i priset: " + o.notIncluded!.join(", ") + ".", { size: 9, color: MUTED }); }
    para("Priset efter RUT gäller om du har rätt till RUT-avdrag och utrymme kvar för året.", { size: 8.5, color: MUTED });
  }
  if (!signed && b.packages?.length) {
    heading("Välj paket i offerten");
    for (const p of b.packages) { need(16); y -= 15; text(p.name, M, y, { font: fb }); text(p.desc, M + 90, y, { size: 9, color: MUTED }); right(kr(p.total), W - M, y); }
  }
  const extras = signed ? (b.extras || []).filter((e) => b.extrasChosen?.includes(e.id)) : b.extras || [];
  if (extras.length) {
    heading(signed ? "Valda tillval" : "Tillval du kan lägga till");
    for (const e of extras) { need(16); y -= 15; text(e.label, M, y); right("+" + kr(e.price), W - M, y); }
  }

  heading("Bra att veta");
  for (const t of [
    "Flytten följer branschens villkor Bohag 2010 och FX Flytts villkor (fxflytt.se/villkor).",
    trust?.insured ? `Dina saker är försäkrade under flytten${trust.insurer ? " (ansvarsförsäkring hos " + trust.insurer + ")" : ""}.` : "",
    "Ändra datum kostnadsfritt fram till 2 dagar före och avboka kostnadsfritt fram till 6 dagar före flyttdagen.",
    "Vi drar RUT-avdraget direkt på fakturan – du betalar bara beloppet ovan.",
  ].filter(Boolean)) para("•  " + t, { size: 9.5 });

  if (!signed && b.token) {
    need(54); y -= 18;
    page.drawRectangle({ x: M, y: y - 34, width: W - M * 2, height: 38, color: rgb(1, 0.95, 0.9) });
    text("Så bokar du", M + 12, y - 12, { size: 10, font: fb, color: NAVY });
    text("Öppna offerten i mobilen eller datorn och tryck Signera och boka:", M + 12, y - 26, { size: 9.5 });
    y -= 34; need(16); y -= 14;
    const url = (process.env.SITE_URL || "https://www.fxflytt.se") + "/signera?t=" + b.token;
    text(url, M + 12, y, { size: 9, color: NAVY });
  }
  footer();
  return await doc.save();
}
