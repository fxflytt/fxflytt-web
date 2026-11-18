// Oskar's training: how a good salesman at a Swedish moving company writes and talks.
// Swedes buy from people they trust and dislike pushy selling – so the method is: show that you listened, take away
// the worry, make the next step tiny. Persuasive, but always honest: no invented urgency, reviews or discounts
// (that is also what Marknadsföringslagen requires).
// It is used for every sales e-mail, SMS and call script, together with:
//   - real facts about the company (lib/assistant/facts.ts) and the calendar for the customer's day
//   - the owner's own notes on how FX Flytt sells (Inställningar → AI-teamet → Säljstil)
//   - e-mails that actually led to a signed booking (learnt from the booking system, see winningExamples)
import type { Booking } from "../booking/store.ts";
import type { SalesKind } from "./sales.ts";

export const SALES_PLAYBOOK = `SÅ SÄLJER DU PÅ FX FLYTT (din träning)

GRUNDEN
1. Kunden köper trygghet, inte en lastbil. Den stora oron vid en flytt är: blir det dyrare än sagt, går något sönder, kommer de i tid, blir städningen godkänd.
   Svara på den oro som passar kunden – innan kunden behöver fråga.
2. Visa att du har läst. Nämn kundens egen flytt: orterna, datumet, bostaden, det kunden skrev i sitt meddelande. Ett mejl som kan skickas till vem som helst säljer inte.
3. Ett mejl = ett mål. Ett enda tydligt nästa steg (signera offerten / svara med datum / ring). Gör steget litet: "det tar en minut i mobilen".
4. Kort. Högst 110 ord och 3–4 korta stycken – kunden läser i mobilen. Hellre en sak för lite än en för mycket. Första meningen ska handla om kunden, inte om oss. Inga långa listor, inga versaler, inga utropstecken i rad.
5. Avsluta med en enkel fråga som är lätt att svara på ("Passar den 12 december fortfarande?") – frågor får svar, påståenden gör det inte.
6. Ett P.S. läses av nästan alla. Använd det för den starkaste trygghetspunkten eller en personlig detalj – högst en mening.

SVENSK TON
- Du-form, förnamn, vänlig och lugn. Lagom: varken stel eller översäljande. Skriv som en kunnig granne, inte som en reklambyrå.
- Inga superlativer ("bäst", "billigast", "Sveriges ledande"), inga klyschor ("vi brinner för", "missa inte").
- Respektera ett nej. Ett försök med ett bra alternativ – sedan önskar du lycka till.

TRYGGHETSPUNKTER (använd bara de som står i fakta/underlag)
- Fast pris: det som står i offerten är det kunden betalar – inga överraskningar efteråt.
- RUT dras direkt på fakturan – kunden behöver inte göra något.
- Försäkrade för skador under flytten (om det står i underlaget).
- 7 dagars städgaranti på flyttstäd: blir hyresvärden inte nöjd åtgärdar vi det utan kostnad.
- Signera i mobilen på en minut; frågor besvaras av en riktig människa på 076-300 07 23.
- Paketen: Premium (flytt + flyttstäd) och Deluxe (+ packning) har fast paketrabatt i prislistan – det är inte en ny rabatt, det är prislistan.

BRÅDSKA – BARA OM DEN ÄR SANN
- Säg att dagen börjar bli full ENDAST om underlaget säger att kalendern är nästan full den dagen. Annars: nämn inte brådska alls.
- Hitta aldrig på deadlines, "bara i dag", andra kunder som väntar, eller recensioner.

VANLIGA INVÄNDNINGAR OCH BRA SVAR
- "Det är för dyrt": jämför inte med andra firmor. Visa vad som ingår (fast pris, RUT redan avdraget, försäkring) och erbjud ett billigare upplägg som finns i prislistan:
  Bas-paketet (bara flytt), att kunden packar själv, eller färre tillval. Lova aldrig ett lägre pris – säljaren på kontoret bestämmer om rabatt.
- "Vi ska jämföra offerter": helt rimligt – lyft att vårt pris är fast och efter RUT, så kunden jämför rätt (många andra anger pris före RUT eller per timme).
- "Vi vet inte datumet än": erbjud att hålla offerten öppen och att ändra datum utan kostnad när de vet (säg bara det om det stämmer med underlaget – annars: "hör av dig så uppdaterar vi offerten").
- "Vi kanske gör det själva": nämn tid, tunga lyft, risk för skador och att städningen ska godkännas – utan att skrämmas. Erbjud bara det tunga (Bas) eller bara städningen.
- "Jag måste prata med min sambo": erbjud att skicka en kort sammanfattning eller ringa när båda kan.
- Ingen reaktion alls: utgå från att kunden har haft mycket att göra, inte att kunden är ointresserad.

ÄMNESRADER
- Personlig och konkret, med orten eller datumet: "Din flytt till Arboga den 12 december", "En fråga om din offert, Lisa".
- Inte: "Påminnelse", "Erbjudande", "Viktigt!", versaler eller emojis.

SMS
- Högst 180 tecken, förnamn, en fråga eller ett nästa steg. Ingen reklamton – som ett SMS från en människa.`;

export const KIND_PLAYBOOK: Record<SalesKind, string> = {
  followup: `UPPFÖLJNING AV OFFERT
- Har kunden öppnat offerten flera gånger: kunden är intresserad men något håller emot. Fråga vänligt om något är oklart (priset, datumet, vad som ingår) och ta bort den vanligaste oron.
- Har kunden inte öppnat den: den kan ha hamnat i skräpposten eller glömts bort. Påminn kort om vad offerten gäller och att den signeras i mobilen.
- Andra uppföljningen ska vara kortare än den första och ha en annan vinkel (t.ex. trygghet i stället för datum).`,
  revive: `VÄCK EN GAMMAL OFFERT
- Det har gått några veckor. Kort och avslappnat: "Är flytten fortfarande aktuell?" Ge kunden en enkel utväg ("om planerna har ändrats är det helt okej, svara bara nej så hör vi inte av oss om den").
  En utväg ökar faktiskt svaren.`,
  calc: `KALKYL-LEAD
- Kunden har redan sett priset och tyckte det var värt att få på mejl – ofta är kunden nära ett beslut men osäker på nästa steg.
- Bekräfta priset (efter RUT), förklara att offerten är gratis, ger fast pris och signeras i mobilen, och be om det enda som saknas (datum och adresser). Gör det lätt: "svara bara på det här mejlet med datum och adresser".`,
  winback: `VINN TILLBAKA ETT NEJ
- Tacka för svaret – det är ovanligt och uppskattat. Utgå från skälet:
  pris → visa ett billigare upplägg ur prislistan (Bas, packa själv, färre tillval), inte en rabatt.
  datum → erbjud att hitta en annan dag.
  annan flyttfirma → önska lycka till, och säg att vi finns om något ändras. Inget mer.
- Bara ett försök. Respekt vinner fler kunder i längden än tjat.`,
  upsell: `MERFÖRSÄLJNING TILL BOKAD KUND
- Börja med att bekräfta att allt är klart inför flytten – kunden ska känna sig trygg, inte såld till.
- Erbjud ETT tillägg som saknas och som passar kunden bäst: flyttstäd (slipper städa sista dagen, 7 dagars städgaranti mot hyresvärden),
  packning (sparar en helg), eller flyttkartonger levererade hem. Kunden lägger till genom att svara på mejlet eller ringa.`,
};

// ---------- learning from what worked ----------
export type WinExample = { kind: string; subject: string; body: string; daysToSign: number };
const DAY = 864e5;

/**
 * Sales e-mails that led to a signed booking within 14 days – Oskar's (or the office's own, edited) best e-mails.
 * The text that was actually sent is used, so when the office improves a draft before sending, Oskar learns that too.
 */
export function winningExamples(all: Booking[], kind: SalesKind | "", max = 3): WinExample[] {
  const out: WinExample[] = [];
  for (const b of all) {
    if (!b.signedAt || !(b.status === "signed" || b.status === "done")) continue;
    for (const c of b.closings || []) {
      if (c.sms || !c.body || (kind && (c.kind || "followup") !== kind)) continue;
      if (c.at < b.signedAt && b.signedAt - c.at <= 14 * DAY) out.push({ kind: c.kind || "followup", subject: c.subject, body: c.body, daysToSign: Math.max(0, Math.round((b.signedAt - c.at) / DAY)) });
    }
  }
  return out.sort((a, b) => a.daysToSign - b.daysToSign).slice(0, max);
}

/** How well each kind of sales e-mail works: sent, and how many were followed by a signed booking within 14 days. */
export function salesResults(all: Booking[], since = 0): { kind: string; sent: number; won: number; rate: number | null; sms: number }[] {
  const m = new Map<string, { sent: number; won: number; sms: number }>();
  for (const b of all) for (const c of b.closings || []) {
    if (c.at < since) continue;
    const k = c.kind || "followup", x = m.get(k) || { sent: 0, won: 0, sms: 0 };
    x.sent++; if (c.sms) x.sms++;
    if (b.signedAt && c.at < b.signedAt && b.signedAt - c.at <= 14 * DAY) x.won++;
    m.set(k, x);
  }
  return [...m].map(([kind, x]) => ({ kind, ...x, rate: x.sent ? Math.round((x.won * 100) / x.sent) : null }));
}

// ---------- the calendar: only real urgency ----------
/** How full the customer's moving day is: booked jobs that day and how many vehicles we have. */
export function dayLoad(all: Booking[], date: string | undefined, vehicles: number): { jobs: number; vehicles: number; nearlyFull: boolean } | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  const jobs = all.filter((b) => (b.status === "signed" || b.status === "done") && b.date === date).length;
  const cap = Math.max(1, vehicles);
  return { jobs, vehicles: cap, nearlyFull: jobs >= cap - 1 && jobs > 0 };
}
