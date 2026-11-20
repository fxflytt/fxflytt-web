// Elsa's exam: the owner's 20 customer scenarios (2026-11-20) and a few from the first tests. Run them from
// AI-team → Översikt → "Testa Elsa": every question goes through the real reply step (same rules, facts and prices),
// and simple checks show at once whether the answer follows the office's rules. The office reads the answers too.
// Nothing is sent to anyone. Costs a few kronor per run (one reply per scenario).
import type { Booking } from "../booking/store.ts";
import { writeReply, type Link } from "./inbox.ts";
import { estimate } from "./estimate.ts";
import { extraCheck } from "./volume.ts";
import { knowledge } from "./knowledge.ts";
import type { Prices } from "../pricing/current.ts";

export type Scenario = {
  id: string; title: string; ask: string; subject?: string;
  booked?: { inDays: number; time?: string; areaM2?: number; m3?: number };   // the customer has a booking (fake, never saved)
  addItems?: { id: string; qty: number }[];
  must?: string[]; mustNot?: string[];   // regular expressions (case-insensitive) the answer must / must not match
  expect: string;                        // the office's rule, shown next to the answer
};

export const SCENARIOS: Scenario[] = [
  { id: "1a", title: "Starttid – bokad", booked: { inDays: 20, time: "08:00" }, ask: "Hej! Vilken tid kommer ni på flyttdagen?", must: ["\\b8\\b|08[:.]00"], expect: "Säg tiden i bokningen (kl. 8)." },
  { id: "1b", title: "Starttid – inte bokad", ask: "Hej! Om jag bokar, vilken tid på dagen kommer ni?", must: ["återkom|bestämm|passar"], mustNot: ["kl\\.? ?\\d{1,2}[:.]\\d{2}"], expect: "Vi bestämmer en tid som passar och återkommer." },
  { id: "2", title: "Helger och kvällar", ask: "Jobbar ni på helger eller kvällar? Vi vill helst flytta en söndag.", must: ["söndag|helg"], mustNot: ["jobbar (vi )?inte (på )?(helg|söndag)"], expect: "Ja – alla dagar, kvällar, röda dagar och helgdagar." },
  { id: "3", title: "Hur lång tid", ask: "Hur lång tid tar en flytt av en tvåa på 60 kvm ungefär?", must: ["timm"], expect: "Ca 4–4,5 timmar lastning och lossning, körtiden kommer till." },
  { id: "4", title: "Antal flyttare", ask: "Hur många flyttare kommer ni med? Vi har en etta på 35 m².", must: ["två|2 (personer|flyttare)"], expect: "Under 20 m³ oftast två personer." },
  { id: "5a", title: "Betalning", ask: "Hur betalar man? Kan jag betala kontant på plats?", must: ["faktura", "10 dagar"], mustNot: ["kontant(er)? (går|fungerar) bra"], expect: "Aldrig kontant. Faktura efter jobbet, 10 dagar." },
  { id: "5b", title: "Betalning – bokar nära", booked: { inDays: 4, time: "09:00" }, ask: "Jag har just bokat flytten om några dagar. Hur betalar jag?", must: ["swish"], expect: "Bokat 6 dagar eller mindre före: Swish före flytten." },
  { id: "6", title: "Handpenning", ask: "Måste jag betala någon handpenning när jag bokar?", must: ["ingen handpenning|inte .{0,20}handpenning|ingen förskottsbetalning"], expect: "Ingen handpenning – aldrig." },
  { id: "7", title: "Montering", ask: "Plockar ni isär och sätter ihop sängen och garderoben, eller ingår inte det?", must: ["monter"], expect: "Bas = det som är klart att flyttas. Montering är en egen tjänst per timme." },
  { id: "8", title: "Bärsträcka", ask: "Flyttbilen kan inte stå vid porten, det är ca 50 meter att bära. Kostar det extra?", must: ["ingen (extra )?(avgift|kostnad)|kostar inte extra|inte extra"], expect: "Ingen avgift för bärsträcka." },
  { id: "9", title: "Våning utan hiss", ask: "Vi bor på femte våningen utan hiss. Blir det dyrare?", must: ["påverkar inte|inte dyrare|ingen (extra )?(avgift|kostnad)"], expect: "Våning och hiss påverkar inte priset." },
  { id: "10", title: "Kyl och frys", ask: "Behöver jag göra något med kylskåpet och frysen innan flytten?", must: ["avfrost"], expect: "Avfrostade, tomma och klara på flyttdagen." },
  { id: "11", title: "Växter, smycken, katt", ask: "Kan ni ta med våra krukväxter, smyckena och katten i flyttbilen?", must: ["kartong|låda", "själv"], expect: "Växter packade i låda/kartong: ja. Smycken och djur flyttar kunden själv." },
  { id: "12", title: "Billigare konkurrent", ask: "En annan flyttfirma gav mig ett pris som är 1 000 kr billigare. Kan ni gå ner i pris?", must: ["försäkr", "trafiktillstånd"], mustNot: ["\\d+ ?% (rabatt|lägre)", "vi sänker"], expect: "Fråga om de har försäkring och tillstånd, lyft vår trygghet, säg att kontoret ser om ett bättre pris går – inget löfte." },
  { id: "13", title: "Mer saker på flyttdagen", booked: { inDays: 15, areaM2: 50 }, ask: "Vad händer om jag har mer saker än jag sa på flyttdagen?", must: ["godkänn|tillägg"], expect: "Vi uppskattar, ger pris, kunden godkänner ett tillägg till avtalet innan." },
  { id: "14", title: "Förseningar", ask: "Vad händer om ni blir sena på flyttdagen?", must: ["kontakt"], expect: "Vi är noga med tider; händer något kontaktar vi kunden direkt och skickar ett annat team." },
  { id: "15", title: "Avbokning nära", booked: { inDays: 3 }, ask: "Jag bokade på nätet och vill avboka flytten.", must: ["10 ?%"], expect: "Villkoren gäller: 5 dagar eller mindre = 10 %." },
  { id: "16a", title: "Ändra datum – 3 dagar kvar", booked: { inDays: 3 }, ask: "Vi behöver skjuta upp flytten en vecka. Kostar det något?", must: ["kostnadsfri|utan kostnad|kostar inget|inte kostar"], mustNot: ["10 ?%"], expect: "Ändra datum: gratis fram till 2 dagar före; full dag → kontoret bekräftar." },
  { id: "16b", title: "Ändra datum – i morgon", booked: { inDays: 1 }, ask: "Kan vi flytta flytten från i morgon till nästa vecka i stället?", must: ["10 ?%"], mustNot: ["avbok\\w* .{0,30}kostnadsfri"], expect: "Ändra datum mindre än 2 dagar före: 10 % av priset." },
  { id: "17", title: "Städning underkänd", ask: "Hyresvärden godkände inte flyttstädningen. Vad gör vi nu?", must: ["protokoll|lista"], expect: "Vi kommer tillbaka gratis. Be om besiktningsprotokoll eller en lista per mejl." },
  { id: "18", title: "Otrevlig personal", ask: "Era flyttare var otrevliga mot mig i går.", must: ["ursäkt|beklag|tråkigt"], mustNot: ["vi ersätter|du får (en )?(rabatt|ersättning)"], expect: "Be om ursäkt, fråga vad som hände, lova att titta på det – ingen ersättning." },
  { id: "19", title: "Magasinering", ask: "Vi behöver magasinera våra saker i två månader mellan Örebro och vårt nya hem i Örebro. Vad kostar det?", must: ["förråd|magasin", "två flyttar|två transporter|återkommer"], expect: "Två flyttar + förrådshyra per månad; förråd i Örebro; kontoret återkommer med helt pris." },
  { id: "20", title: "Bortforsling", ask: "Kan ni hämta och slänga en gammal soffa och några skåp?", must: ["bild"], expect: "Ja – be om bilder, vi uppskattar och återkommer med pris." },
  { id: "21", title: "70 egna kartonger", booked: { inDays: 20, areaM2: 40 }, addItems: [{ id: "box", qty: 70 }], ask: "Ingår flyttkartonger i priset? Jag har omkring 70 stycken.", mustNot: ["ingår (alltså )?i priset", "ingen extra kostnad"], expect: "70 kartonger ≈ 4,2 m³ > 2 m³: lova inget, kontoret kollar. Förklara båda betydelserna kort." },
  { id: "22", title: "Engelska", ask: "Hi! Can you help me move from Västerås to Eskilstuna? It's a 45 m2 apartment. Do you speak English?", must: ["Yes, we can help you in English", "Best regards"], mustNot: ["Vänliga hälsningar"], expect: "Svar på engelska, med pris, och \"Yes, we can help you in English.\"" },
];

export type ScenarioResult = { id: string; title: string; ask: string; expect: string; reply: string; note: string; ok: boolean; problems: string[]; error?: string };

const day = (n: number) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
function fakeBooking(s: Scenario): Booking | null {
  if (!s.booked) return null;
  const area = s.booked.areaM2 ?? 60;
  return { id: "FX000000-TEST" + s.id.toUpperCase().padStart(2, "0").slice(-2), createdAt: Date.now() - 864e5, updatedAt: Date.now(), status: "signed", source: "web",
    data: { name: "Test Kund", phone: "0701234567", email: "test@ex.se", from: "Storgatan 1, Kungsör", to: "Vasagatan 2, Arboga", size: "2 rok", areaM2: String(area), ...(s.booked.m3 ? { volume: { m3: s.booked.m3, items: 0, list: [] } } : {}) },
    offer: { total: 4500, lines: [{ label: `Flytt ${area} m² (1 flyttbil)`, amount: 4500 }] }, date: day(s.booked.inDays), ...(s.booked.time ? { time: s.booked.time } : {}),
    signedAt: Date.now() - 864e5, history: [] } as Booking;
}

export function check(s: Scenario, reply: string): string[] {
  const p: string[] = [];
  for (const r of s.must || []) if (!new RegExp(r, "i").test(reply)) p.push(`saknar: /${r}/`);
  for (const r of s.mustNot || []) if (new RegExp(r, "i").test(reply)) p.push(`får inte stå: /${r}/`);
  return p;
}

export async function runScenarios(P: Prices, ids?: string[], name = "Elsa"): Promise<ScenarioResult[]> {
  const list = SCENARIOS.filter((s) => !ids?.length || ids.includes(s.id));
  const k = knowledge(P), today = day(0), out: ScenarioResult[] = [];
  const queue = [...list];
  const worker = async () => {
    for (let s = queue.shift(); s; s = queue.shift()) {
      const b = fakeBooking(s);
      const link: Link = b ? { sure: b, maybe: null, note: "Testbokning." } : { sure: null, maybe: null, note: "" };
      const est = b ? null : estimate({ name: "", phone: "", from: "", to: "", date: "", size: s.ask }, P, s.ask);
      const extra = b && s.addItems ? extraCheck(b, s.addItems, (P as { truckM3?: number }).truckM3 || 20) : null;
      try {
        const r = await writeReply({ from: "test@ex.se", fromName: b ? "Test Kund" : "Test", subject: s.subject || "Fråga", text: s.ask, draft: "", extracted: undefined },
          { link, estimate: est, extra, knowledge: k, name, today });
        const problems = check(s, r.draft);
        out.push({ id: s.id, title: s.title, ask: s.ask, expect: s.expect, reply: r.draft, note: r.note, ok: !problems.length, problems });
      } catch (e) {
        out.push({ id: s.id, title: s.title, ask: s.ask, expect: s.expect, reply: "", note: "", ok: false, problems: [], error: (e as Error).message.slice(0, 200) });
      }
    }
  };
  await Promise.all([worker(), worker(), worker(), worker()]);
  return SCENARIOS.map((s) => out.find((r) => r.id === s.id)).filter((r): r is ScenarioResult => !!r);
}
