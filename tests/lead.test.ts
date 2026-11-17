import { test } from "node:test";
import assert from "node:assert/strict";
import "../public/fx-lead.js";
const L = (globalThis as unknown as { FXLead: { parse: (t: string, today?: string) => Record<string, any> } }).FXLead;
const T = "2026-11-17";

test("lead med etiketter (lead-sajt)", () => {
  const r = L.parse(`Ny offertförfrågan
Namn: Felicia Langryd
Telefon: 070-123 45 67
E-post: felicia.l@example.se
Från: Storgatan 3, Skövde
Till: Hamngatan 10, Hjo
Flyttdatum: 4 dec 2026 (± 5 dagar)
Boyta: 65 m²
Bostadstyp: Lägenhet
Våning från: 3 tr, ingen hiss
Tjänster: Flytt + Städ
Meddelande: Vi har ett piano.
Ring helst efter 16.`, T);
  assert.equal(r.name, "Felicia Langryd");
  assert.equal(r.phone, "070-123 45 67");
  assert.equal(r.email, "felicia.l@example.se");
  assert.equal(r.from, "Storgatan 3, Skövde"); assert.equal(r.to, "Hamngatan 10, Hjo");
  assert.equal(r.date, "2026-12-04"); assert.equal(r.flex, "± 5 dagar");
  assert.equal(r.areaM2, "65"); assert.equal(r.home, "Lägenhet");
  assert.equal(r.floorFrom, "3 tr"); assert.equal(r.liftFrom, "Ingen hiss");
  assert.match(r.message, /piano[\s\S]*efter 16/);
  assert.ok(r.wants.clean && r.wants.move);
});

test("fritext (sms/mejl)", () => {
  const r = L.parse(`Hej! Jag heter Moa Berggren och ska flytta från Mantorp till Linköping den 15 februari. Villa ca 160 kvm. Behöver även flyttstäd och packhjälp. Nås på 0701234567 eller moa@exempel.se`, T);
  assert.equal(r.phone, "0701234567"); assert.equal(r.email, "moa@exempel.se");
  assert.equal(r.from, "Mantorp"); assert.equal(r.to, "Linköping");
  assert.equal(r.date, "2027-02-15");        // no year → next time it comes round
  assert.equal(r.areaM2, "160"); assert.equal(r.home, "Villa");
  assert.equal(r.svc, "move|deluxe");
});

test("pil-format och etikett på egen rad", () => {
  const r = L.parse(`Lovis Klockner
Villa · 70 m² · Mantorp → Linköping · 1 feb. 2027 · ± 1 månad
Telefon
+46 70 555 12 34`, T);
  assert.equal(r.name, "Lovis Klockner");
  assert.equal(r.from, "Mantorp"); assert.equal(r.to, "Linköping");
  assert.equal(r.date, "2027-02-01"); assert.equal(r.flex, "± 1 månad");
  assert.equal(r.phone, "+46 70 555 12 34"); assert.equal(r.svc, "move|bas");
});
