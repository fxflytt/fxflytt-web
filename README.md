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

## AI-teamet (Inkorg, Säljaren, Klagomål, Veckorapport)
Fyra "medarbetare" som använder Claude med samma `ANTHROPIC_API_KEY`. De läser, sorterar och skriver utkast – **inget skickas till kunder förrän någon trycker Skicka**.
- **Inkorg** (`/admin#inkorg`, `lib/agents/inbox.ts`): läser info@ över IMAP (`lib/mail/imap.ts`, samma `SMTP_USER`/`SMTP_PASS`, server `mail.inleed.com:993` – ändra med `IMAP_HOST`/`IMAP_PORT`). Bara läsning: inget raderas, flyttas eller markeras som läst. Mejlen sorteras (offert, bokning, klagomål …), kopplas till kundens bokning och får ett svarsutkast. Svar skickas i samma tråd och läggs i Skickat. Läses var 5:e minut när adminen är öppen, och varje morgon (`/api/cron/agents`).
- **Säljaren** (`/admin#saljaren`, `lib/agents/sales.ts`): visar vilka skickade offerter som är värda ett personligt mejl och skriver det i offerten. Ändrar aldrig priset.
- **Klagomål** (`/admin#klagomal`, `lib/agents/complaints.ts`): klagomål från inkorgen (eller inlagda efter samtal) med allvar, nästa steg, svarsdag och svarsutkast. Allvarliga ger en notis.
- **Veckorapport** (Statistik → Veckorapport, `lib/agents/weekly.ts`): varje måndag räknas förra veckan (exakt, av koden) och AI:n skriver sammanfattning och tre saker att göra. Mejlas till info@.
- Inställningar → AI-teamet: av/på, mottagare för rapporten, hur länge mejlkopior sparas (standard 180 dagar).
- Modeller (`lib/agents/claude.ts`): `claude-haiku-5-5` sorterar varje mejl (billig, snabb); `claude-opus-5-5` skriver om svar, klagomålssvar, säljmejl och veckorapporten.

## Ta bort chattassistenten
Ta bort raden `python3 add-chat.py` i `build-site.sh` och kör om bygget – eller sätt `ENABLED = false` i `public/chat-widget.js`.

## Ändra priser
Ägaren ändrar priserna i admin → Inställningar → Priser. De nya priserna sparas i Upstash och används direkt av
prisräknaren, `/api/price`, chatten (`lib/assistant/facts.ts` skriver prisraderna från prislistan) och nya offerter.
Sidorna byggs med priserna i `lib/pricing/prices.json`; `add-price-marks.py` märker varje pris och `public/fx-prices.js`
byter till prislistan som gäller när sidan öppnas. Titlar, metabeskrivningar och strukturerad data (det Google läser)
behåller priserna från senaste bygget – uppdatera `prices.json` och kör `./build-site.sh` när priserna har ändrats för gott.
