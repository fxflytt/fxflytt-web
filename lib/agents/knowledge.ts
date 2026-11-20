// Everything the AI team may say about FX Flytt: the facts the website chat uses (prices from the price list in use,
// terms, RUT …) plus the text of the service and terms pages (villkor, paket, flyttstad, utlandsflytt, pianoflytt,
// kontorsflytt …), copied from the website by scripts/site-facts.mjs. Same words as the website – nothing else.
import SITE from "../assistant/sitefacts.json" with { type: "json" };
import { companyFacts } from "../assistant/facts.ts";
import { OFFICE_RULES } from "./officerules.ts";
import type { Prices } from "../pricing/current.ts";

export function knowledge(P: Prices): string {
  const pages = Object.entries(SITE as Record<string, string>).map(([k, v]) => `<sida namn="${k}">\n${v}\n</sida>`).join("\n");
  return `${OFFICE_RULES}\n\n${companyFacts(P)}\n\nSIDOR PÅ WEBBPLATSEN (samma text som kunden ser):\n${pages}`;
}
