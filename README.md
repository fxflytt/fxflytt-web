# FX Flytt AB – webbplats (första versionen)

## Vad som finns
- `site-src/` – källan till sidorna. Kör `./build-site.sh` efter ändringar; det bygger alla 13 sidor till `public/`.
- `public/` – sidorna som visas (startsida, 5 menysidor, 5 stadssidor, integritetspolicy, villkor) och chattbubblan `chat-widget.js`.
- `app/api/quote` – räknar pris PÅ SERVERN med prismotorn (`lib/pricing`). Webbläsaren skickar aldrig ett pris.
- `app/api/chat` – chattassistenten (Claude). Svarar bara utifrån `lib/assistant/facts.ts`.
- `/admin` – adminpanelen: Idag, Bokningar, Kalender, Personal och fordon, Statistik. Personal och fordon sparas i Upstash (`lib/booking/team.ts`); vem som gör vilket jobb och krockar räknas i `public/fx-schedule.js` (samma fil i webbläsaren och på servern).
- `db/schema.sql` – databasen för bokningar (används när Supabase är kopplat).
- `tests/` – `npm test` (19 tester: priser, RUT, FlexFlytt, chatt).

## Inställningar på Vercel (Environment Variables)
| Namn | Vad | Var |
|---|---|---|
| `ANTHROPIC_API_KEY` | Nyckeln från platform.claude.com (börjar med `sk-ant-`) | Vercel → Project → Settings → Environment Variables |

Utan nyckeln fungerar sidan ändå: chattbubblan svarar då med inbyggda svar.

## Ta bort chattassistenten
Ta bort raden `python3 add-chat.py` i `build-site.sh` och kör om bygget – eller sätt `ENABLED = false` i `public/chat-widget.js`.

## Ändra priser
Ägaren ändrar priserna i admin → Inställningar → Priser. De nya priserna sparas i Upstash och används direkt av
prisräknaren, `/api/price`, chatten (`lib/assistant/facts.ts` skriver prisraderna från prislistan) och nya offerter.
Sidorna byggs med priserna i `lib/pricing/prices.json`; `add-price-marks.py` märker varje pris och `public/fx-prices.js`
byter till prislistan som gäller när sidan öppnas. Titlar, metabeskrivningar och strukturerad data (det Google läser)
behåller priserna från senaste bygget – uppdatera `prices.json` och kör `./build-site.sh` när priserna har ändrats för gott.
