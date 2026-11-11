# FX Flytt AB – webbplats (första versionen)

## Vad som finns
- `site-src/` – källan till sidorna. Kör `./build-site.sh` efter ändringar; det bygger alla 13 sidor till `public/`.
- `public/` – sidorna som visas (startsida, 5 menysidor, 5 stadssidor, integritetspolicy, villkor) och chattbubblan `chat-widget.js`.
- `app/api/quote` – räknar pris PÅ SERVERN med prismotorn (`lib/pricing`). Webbläsaren skickar aldrig ett pris.
- `app/api/chat` – chattassistenten (Claude). Svarar bara utifrån `lib/assistant/facts.ts`.
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
Priserna finns i `lib/pricing/config.current.ts`, på sidorna (`site-src/`) och i `lib/assistant/facts.ts`. Ändra alla tre tills adminpanelen är byggd.
