# FX Flytt AB – webbplats (första versionen)

## Vad som finns
- `site-src/` – källan till sidorna. Kör `./build-site.sh` efter ändringar; det bygger alla 13 sidor till `public/`.
- `public/` – sidorna som visas (startsida, 5 menysidor, 5 stadssidor, integritetspolicy, villkor) och chattbubblan `chat-widget.js`.
- `app/api/quote` – räknar pris PÅ SERVERN med prismotorn (`lib/pricing`). Webbläsaren skickar aldrig ett pris.
- `app/api/chat` – chattassistenten (Claude). Svarar bara utifrån `lib/assistant/facts.ts`.
- `/admin` – adminpanelen: Idag, Bokningar, Kalender, Personal och fordon, Statistik. Personal och fordon sparas i Upstash (`lib/booking/team.ts`); vem som gör vilket jobb och krockar räknas i `public/fx-schedule.js` (samma fil i webbläsaren och på servern).
- `db/schema.sql` – databasen för bokningar (används när Supabase är kopplat).
- `tests/` – `npm test` (priser, RUT, FlexFlytt, chatt, AI-teamet).

## Inställningar på Vercel (Environment Variables)
| Namn | Vad | Var |
|---|---|---|
| `ANTHROPIC_API_KEY` | Nyckeln från platform.claude.com (börjar med `sk-ant-`) | Vercel → Project → Settings → Environment Variables |

Utan nyckeln fungerar sidan ändå: chattbubblan svarar då med inbyggda svar.

## AI-teamet (i bokningssystemet: `/admin#ai`)
Fyra AI-kollegor med svenska namn (ändras i Inställningar → AI-teamet). Från början skriver de bara utkast; ägaren väljer vad de får skicka själva.
Mejl de skickar själva är undertecknade med namnet och "digital assistent", räknas mot en gräns per dag (standard 15) och syns i bokningens historik och i AI-team → Översikt.
- **Elsa – kundservice/e-post** (`lib/agents/inbox.ts`): läser info@ över IMAP (`lib/mail/imap.ts`, samma `SMTP_USER`/`SMTP_PASS`, `mail.inleed.com:993`, ändra med `IMAP_HOST`/`IMAP_PORT`). Bara läsning. Sorterar, kopplar till bokningen, skriver svar utifrån företagsfakta (`lib/assistant/facts.ts`). Offertmejl → förfrågan i Offerter med prisförslag från prismotorn (`lib/agents/estimate.ts`). Kan få svara själv på enkla frågor.
- **Oskar – säljare** (`lib/agents/sales.ts`): följ upp offert, väck förfallen offert, kalkyl-leads, vinn tillbaka nej, merförsäljning (flyttstäd/packning/kartonger), ringmanus. Ändrar aldrig priset.
- **Maja – klagomål** (`lib/agents/complaints.ts`): allvar, nästa steg, svarsdag, svarsutkast, skaderapport. Kan få bekräfta direkt att klagomålet kommit in.
- **Nils – analytiker** (`lib/agents/plan.ts`, `lib/agents/weekly.ts`): dagens plan varje morgon, veckorapport varje måndag (mejlas).
- Daglig körning: `/api/cron/agents` (vercel.json). Inkorgen läses också var 5:e minut när adminen är öppen.
- Modeller (`lib/agents/claude.ts`): `claude-haiku-5-5` sorterar mejl; `claude-opus-5-5` skriver säljmejl, klagomålssvar, ringmanus och veckorapporten.

## Ta bort chattassistenten
Ta bort raden `python3 add-chat.py` i `build-site.sh` och kör om bygget – eller sätt `ENABLED = false` i `public/chat-widget.js`.

## Ändra priser
Ägaren ändrar priserna i admin → Inställningar → Priser. De nya priserna sparas i Upstash och används direkt av
prisräknaren, `/api/price`, chatten (`lib/assistant/facts.ts` skriver prisraderna från prislistan) och nya offerter.
Sidorna byggs med priserna i `lib/pricing/prices.json`; `add-price-marks.py` märker varje pris och `public/fx-prices.js`
byter till prislistan som gäller när sidan öppnas. Titlar, metabeskrivningar och strukturerad data (det Google läser)
behåller priserna från senaste bygget – uppdatera `prices.json` och kör `./build-site.sh` när priserna har ändrats för gott.
