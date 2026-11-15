# FX Flytt AB – status, decisions and next steps

Updated 2026-11-15. (The first version of this plan, from 2026-11-10, described a Supabase-based first release with
five city pages. The site has since grown past that scope; this document describes what actually runs today.)

## 1. Decisions taken by FX Flytt AB

| # | Decision |
|---|---|
| D1 | FX Flytt AB is an independent company, separate from Flytt & Städ AMA Sverige AB / flyttama.se. |
| D2 | FX Flytt has its own domain: **www.fxflytt.se**. Nothing runs under flyttama.se. |
| D3 | FX Flytt AB owns all accounts: hosting, database, domain, code repository, email, and later payments. |
| D4 | RUT: method `selling_price`, 50 % of the mover labour lines. Not changed without the owner's approval; the accountant approves the calculation. |
| D5 | Nothing outside the agreed scope is built without the owner's agreement. |
| D6 | Prices are computed on the server only; no card payments yet. Personnummer (private customers) is required when signing an offer, for RUT and as proof of who signed. It is shown in admin (owner/office) and in the company's booking email; never in the crew app, the customer's emails or the chat. Owner decision 2026-11-15; the privacy policy says the same. |
| D7 | Google Analytics only after the visitor's consent (cookie banner). |

## 2. What runs today

**Public website** (plain HTML in `public/`, built from `site-src/` with `./build-site.sh`)
- Home page with quote form and price calculator, 5 menu pages (tjänster, flyttfirma, paket, om oss, rådgivare),
  20 city pages (each with its own "Bra att veta" text in `site-src/city_local.py` and a
  route table with real prices to the 4 nearest cities), flyttstäd, dödsbo, utlandsflytt, RUT-avdrag, kubikräknare, integritetspolicy, villkor.
- Prices from `lib/pricing/prices.json`; the owner can change them in admin and `public/fx-prices.js` shows the current ones.
- SEO: unique titles/descriptions, canonical clean addresses (308 from `.html`), Open Graph image, MovingCompany +
  BreadcrumbList structured data, `sitemap.xml` (33 pages), `robots.txt`, Search Console verification.
- Chat assistant (Claude) answering only from `lib/assistant/facts.ts`; works with built-in answers without an API key.
- "Få offert" on every page opens the quote form in a pop-up (`site-src/fx-offert.js` + `/offert`, the home page's own form
  alone). City pages pre-fill their town, Flyttstäd pre-selects flyttstäd. The visitor never leaves the page.
- Cookie banner + Google Analytics 4 (`site-src/fx-consent.js`). Measurement ID G-EPPXSBN284.
  Events: `generate_lead` (quote sent, also from the pop-up), `phone_click` / `email_click` with `placement`
  (header, mobile_bar, menu, footer, chat, offert_popup, page). Mark `generate_lead` and `phone_click` as key events in GA.
  Lead events (`generate_lead`) are already sent from the quote form, price-by-email and call-back.

**Booking system**
- `/admin` (installable app with push notifications): Idag, bookings, calendar (month/week/staff timeline, drag and drop),
  staff and vehicles, offers the customer signs via link (`/signera`), reminders, discounts, referral codes,
  sales board, statistics (owner only), rental boxes, Google review requests, vehicles and damage reports,
  daily backups, user accounts with roles and change history.
- `/jobb` – staff app: own jobs, work orders with photos and customer receipt, clock in/out, absence, open jobs, messages.

**Storage and services**
- Upstash Redis (`lib/booking/kv.ts`) for bookings, staff, vehicles and settings. `db/schema.sql` (Supabase) is not in use.
- Vercel Blob for photos, SMTP for email, Vercel cron for daily reminders.

**Quality**
- `npm test` – 70 tests (pricing, RUT, bookings, schedule, staff, clock, fleet, referral, backup, chat, SMTP).
- Dependency versions are pinned exactly in `package.json`.
- Lighthouse (local production build, 2026-11-15, after self-hosting the font): performance, accessibility,
  best practices and SEO 100 on mobile and desktop; LCP on mobile 1.4–1.5 s. The font (Plus Jakarta Sans, OFL)
  is served from `/fonts`, the home page photo as WebP (768 px on phones).

## 3. Environment variables (Vercel → Settings → Environment Variables)

| Name | Purpose |
|---|---|
| `KV_REST_API_URL`, `KV_REST_API_TOKEN` | Upstash Redis (added via Vercel → Storage) |
| `ADMIN_PASSWORD` | First owner login to `/admin` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | Sending email |
| `OFFER_TO` | Address that receives new requests |
| `SITE_URL` | Public address used in links in emails |
| `BLOB_READ_WRITE_TOKEN` | Photo storage (work orders, damage) |
| `CRON_SECRET` | Protects `/api/cron/reminders` |
| `ANTHROPIC_API_KEY` | Chat assistant (optional) |

## 4. Open items

| Item | Status |
|---|---|
| Org.nr in footer, terms and structured data | Waiting for the confirmed number (the earlier one had 11 digits) |
| Customer reviews on the website (Google / Reco / Trustpilot) | In progress |
| Own photos of team and trucks (replace stock photos) | Photo session planned |
| Accessibility: heading order, phone button label, breadcrumb text, darker orange for small text | Done 2026-11-15 |
| Accessibility: orange buttons, labels and the orange band use dark navy text (owner chose option 3) | Done 2026-11-15 |
| Accountant sign-off on the RUT calculation | Open |
