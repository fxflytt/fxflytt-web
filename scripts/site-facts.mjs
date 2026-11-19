// Copies the text of the website's service and terms pages into lib/assistant/sitefacts.json, so the AI team
// (Elsa, Maja, Oskar) answers from exactly what the website says. Run by build-site.sh after every rebuild.
import { readFileSync, writeFileSync } from "node:fs";

const PAGES = ["villkor", "paket", "flyttstad", "utlandsflytt", "pianoflytt", "kontorsflytt", "packning", "magasinering", "bortforsling", "dodsbo", "rut-avdrag", "flytta-med-husdjur"];
const MAX = 7000;
const ENT = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " ", "&ndash;": "–", "&mdash;": "—", "&rsaquo;": "›", "&times;": "×" };

export function pageText(html) {
  const a = html.indexOf('<section class="p-hero"'), b = html.indexOf("<footer");
  let s = html.slice(a >= 0 ? a : 0, b > a ? b : html.length);
  s = s.replace(/<(script|style|svg|form|nav)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<div class="(crumbs|hero-cta)"[\s\S]*?<\/div>/gi, " ")
    .replace(/<h[1-4][^>]*>/gi, "\n## ").replace(/<li[^>]*>/gi, "\n- ").replace(/<\/(p|h[1-4]|li|tr|div)>/gi, "\n").replace(/<br\s*\/?>/gi, "\n")
    .replace(/<td[^>]*>/gi, " | ").replace(/<[^>]+>/g, "").replace(/&[a-z#0-9]+;/gi, (e) => ENT[e] ?? " ");
  return s.split("\n").map((l) => l.replace(/\s+/g, " ").trim()).filter((l) => l && l !== "-" && l !== "##").join("\n").replace(/\n{3,}/g, "\n\n").slice(0, MAX);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const out = {};
  for (const p of PAGES) { try { out[p] = pageText(readFileSync(`site-src/${p}.html`, "utf8")); } catch { /* page removed */ } }
  writeFileSync("lib/assistant/sitefacts.json", JSON.stringify(out, null, 1) + "\n");
  console.log("sitefacts:", Object.entries(out).map(([k, v]) => `${k} ${v.length}`).join(", "));
}
