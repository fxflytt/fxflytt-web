# FX Flytt AB – First release: plan and architecture

Status: preparation phase. Prepared 2026-11-10.

## 1. Decisions taken by FX Flytt AB (2026-11-10)

| # | Decision |
|---|---|
| D1 | FX Flytt AB is an independent company, separate from Flytt & Städ AMA Sverige AB / flyttama.se. |
| D2 | FX Flytt gets its own dedicated domain. Nothing runs under flyttama.se. |
| D3 | FX Flytt AB owns all accounts: hosting, database, domain, code repository, email, and later payments. |
| D4 | RUT: the current configuration is kept unchanged (method `selling_price`, 50 % of the mover labour lines). It can't be changed without the owner's approval. The accountant must approve the final calculation before launch. |
| D5 | First-release scope approved (section 2). Nothing outside it is built without the owner's agreement. |
| D6 | Non-negotiable requirements: prices computed on the server only; bookings checked against real crew/vehicle capacity; personnummer only when needed, encrypted, never in emails or logs; no payments in the first release. |

## 2. First-release scope

**In scope**
1. Redesigned website keeping the current visual identity, plus city landing pages (Kungsör, Örebro, Eskilstuna, Västerås, Katrineholm).
2. Full moving calculator: type of move → addresses (autocomplete + real driving distance) → property → furniture inventory (m³) → extras → date/slot → summary.
3. Pricing engine on the server, configuration editable in the dashboard, versioned. RUT shown before/after, labelled as an estimate subject to Skatteverket.
4. Real bookings: reference number (FX-YYYY-NNNNN), capacity-safe slot booking, duplicate-submission protection.
5. Admin dashboard: bookings list/search/filter, booking detail, status changes with history, internal notes, price adjustment, capacity slots, pricing config, catalogue, service areas.
6. Emails: "booking received" to the customer and to FX Flytt; status-change emails.
7. Essential SEO: titles, meta, sitemap.xml, robots.txt, canonical, Open Graph, LocalBusiness structured data, GA4 events for the calculator funnel.
8. Privacy policy, terms, cookie consent (GA4 only after consent).

**Out of scope (later releases):** customer accounts/portal, employee management, vehicle management (beyond capacity numbers per slot), cleaning booking flow, payments, invoices, SMS, English/Arabic (the text structure is prepared for translation).

## 3. Architecture

```
Browser (Next.js pages)  ──►  Next.js API routes (server, Vercel)  ──►  Supabase Postgres (RLS on)
   calculator UI                 /api/quote      -> computeQuote()          pricing_config (versioned)
   booking form                  /api/slots      -> available_slots()       capacity_slots
   admin dashboard               /api/bookings   -> computeQuote() again    bookings, customers, ...
                                                    + create_booking()      email_outbox -> email worker
                                 Google Routes API (driving distance, server-side key)
                                 Google Places Autocomplete (browser key restricted to the domain)
```

* **Price integrity:** the browser never sends a price. `/api/bookings` recomputes the quote from the input with the active config and stores both input and result, plus `config_version`. Verified by the tests.
* **Distance:** driving distance and time come from the routing API on the server. The straight-line distance is never used for pricing.
* **Capacity:** `create_booking()` locks the slot row and checks crews + vehicles. Verified: 10 simultaneous requests for one free crew → 1 booking, 9 rejected.
* **Duplicates:** each form submission carries an idempotency key. Resubmitting returns the same booking.
* **Stale prices:** a booking computed with an old config version is rejected, and the customer sees the new price.
* **Personnummer:** stored in `customer_rut_identity`, encrypted with a server-only key, with a deletion date. Not readable from the dashboard UI, and never in email templates.

## 4. What is already built and tested (this package)

| File | What | Tests |
|---|---|---|
| `src/pricing/engine.ts` | Pricing engine (volume, crew, hours, extras, distance, weekend, RUT methods A and B, validation) | `npm test` – 13/13 pass |
| `src/pricing/config.current.ts` | The current page's prices, unchanged, as the seed config. Missing values are `null`. | – |
| `db/schema.sql` | Tables, RLS, capacity-safe `create_booking`, `available_slots`, status history | `db/test_booking.sql` – all pass; race test 1/10 |

**Rule in the engine:** a price that FX Flytt hasn't provided is never invented. The quote gets status `estimate_requires_review`, with the reason shown, and the booking lands as *Pending review*.

## 5. Information still needed from FX Flytt AB

| Needed | Why | Blocks |
|---|---|---|
| **Org.nr, checked against the registreringsbevis** (the given 99410059332 has 11 digits; Swedish org.nr has 10, and an AB normally starts with 5) | Footer, legal pages, emails | Launch |
| Domain name | Hosting, email sender, SEO | Deploy |
| Price per km / framkörning | Distance line (now "confirmed manually") | Full automatic quotes |
| Weekend surcharge (or "none") | Weekend dates (now "confirmed manually") | – |
| Prices: boxes, piano/heavy items, bortforsling | Extras (now "confirmed manually") | – |
| Long carrying distance rule | Now "confirmed manually" | – |
| Vehicle capacities (m³) and how many crews/vehicles per day | Capacity slots, vehicle recommendation | Bookings |
| Working days, time windows, max moves per slot | Calendar | Bookings |
| Cancellation policy (the page says 14 days) and FlexFlytt discount (the page says 15 %): confirm or change | Terms, calculator | Launch |
| Insurance (ansvarsförsäkring / goods) | Terms page, FAQ | Launch |
| Accountant sign-off on RUT method | D4 | Launch |
| Email address that receives booking notifications | Notifications | Launch |

## 6. Accounts FX Flytt AB must create (in the company's name)

1. Domain (e.g. at a Swedish registrar).
2. GitHub organisation → code repository.
3. Vercel **Pro** (the free Hobby plan isn't allowed for commercial use).
4. Supabase **Pro** (daily backups).
5. Google Cloud project with billing → Places + Routes APIs, with keys restricted.
6. Email sending service (domain-verified sender).
7. Google Analytics 4 + Search Console.

## 7. Next build steps (once the network is enabled and the accounts exist)

1. Next.js project + Supabase project; apply `db/schema.sql`; seed the config and catalogue.
2. API routes: `/api/quote`, `/api/slots`, `/api/bookings` (rate limited, validated).
3. Calculator + booking UI (mobile first), reusing the current design.
4. Admin dashboard.
5. Email templates + worker.
6. SEO, legal pages, cookie consent, GA4 funnel events.
7. Test round with realistic bookings → owner + accountant approval → launch.

The timeline is a target, not a promise: launch happens after the test round passes, not on a date.
