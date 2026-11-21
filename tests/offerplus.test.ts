import { test } from "node:test";
import assert from "node:assert/strict";
import { validFor, fillIntro, addQuestion, answerQuestion, openQuestions, addDays, today } from "../lib/booking/offerplus.ts";
import { priceAdvice, kindOf } from "../lib/booking/priceadvice.ts";
import { offerPdf, pdfSafe } from "../lib/booking/offerpdf.ts";
import { isExpired, reminderDue, publicView, type Booking } from "../lib/booking/store.ts";
import { INTRO_TPL } from "../lib/booking/settings.ts";

const mk = (o: Omit<Partial<Booking>, "data"> & { data?: Partial<Booking["data"]> } = {}): Booking => ({
  id: "FX261121-ABC123", createdAt: Date.now(), updatedAt: Date.now(), status: "sent", source: "web", history: [],
  ...o, data: { name: "Anna Svensson", phone: "0701234567", email: "anna@example.com", size: "Bara flytt – Bas", areaM2: "60", from: "Storgatan 1, 732 30 Arboga", to: "Ågatan 2, 722 11 Västerås", ...(o.data || {}) } as Booking["data"],
});

test("slutdatum: antal dagar, aldrig efter dagen före flytten, ett senare datum för hand behålls", () => {
  const now = Date.parse("2026-11-21T10:00:00Z");
  assert.equal(validFor({ date: "2026-12-20" }, 7, now), "2026-11-28");
  assert.equal(validFor({ date: "2026-11-24" }, 7, now), "2026-11-23");
  assert.equal(validFor({ date: "2026-11-21" }, 7, now), "2026-11-21");          // moving today: today, not yesterday
  assert.equal(validFor({ date: "2026-12-20", validUntil: "2026-12-10" }, 7, now), "2026-12-10");
  assert.equal(validFor({ date: "2026-12-20" }, 0, now), undefined);
});

test("utgången offert: inga påminnelser, syns i kundens vy", () => {
  const t = today(), y = addDays(t, -1);
  const b = mk({ validUntil: y, sentAt: Date.now() - 2 * 864e5, token: "x" });
  assert.equal(isExpired(b), true);
  assert.equal(reminderDue(b), 0);
  assert.equal(publicView(b).expired, true);
  assert.equal(isExpired(mk({ validUntil: t })), false);
  assert.equal(isExpired(mk({ validUntil: y, status: "signed" })), false);
  assert.equal(reminderDue(mk({ validUntil: addDays(t, 3), sentAt: Date.now() - 25 * 36e5, token: "x" })), 1);
});

test("mallen fylls i, och fraser utan uppgift tas bort", () => {
  const t = fillIntro(INTRO_TPL, mk(), "Ammar");
  assert.match(t, /^Hej Anna!/);
  assert.match(t, /från Arboga till Västerås/);
  const u = fillIntro(INTRO_TPL, mk({ data: { from: "", to: "" } }), "Ammar");
  assert.doesNotMatch(u, /från|\{/);
  assert.match(u, /gått igenom din flytt och räknat/);
});

test("frågor i offerten: ny fråga, dubblett stoppas, svar", () => {
  const b = mk();
  const q = addQuestion(b, "  Kan ni ta med en soffa?  ");
  assert.equal(q.q, "Kan ni ta med en soffa?");
  assert.throws(() => addQuestion(b, "Kan ni ta med en soffa?"), /redan/);
  assert.throws(() => addQuestion(b, "x"), /Skriv/);
  assert.equal(openQuestions(b), 1);
  answerQuestion(b, q.id, "Ja, det går bra.", "Ammar");
  assert.equal(openQuestions(b), 0);
  assert.deepEqual(publicView(b).qa.map((x) => [x.q, x.a, x.aBy]), [["Kan ni ta med en soffa?", "Ja, det går bra.", "Ammar"]]);
});

test("prisråd: liknande offerter, chans faller med högre pris", () => {
  const now = Date.now(), old = now - 30 * 864e5, all: Booking[] = [];
  for (let i = 0; i < 24; i++) {
    const price = 9000 + i * 250, won = price < 12000;   // cheaper ones won
    all.push(mk({ id: "FX2611" + String(i).padStart(2, "0") + "-AAAAAA", status: won ? "signed" : "declined", sentAt: old, offer: { total: price, lines: [] }, data: { areaM2: String(55 + (i % 10)) } }));
  }
  all.push(mk({ id: "FX261199-CLEAN1", status: "signed", sentAt: old, offer: { total: 3000, lines: [] }, data: { size: "Flyttstädning" } }));
  const b = mk({ offer: { total: 12000, lines: [] } });
  const a = priceAdvice(b, all, now);
  assert.equal(a.ok, true);
  if (!a.ok) return;
  assert.equal(a.n, 24);                                         // the cleaning job is not compared
  const ch = a.points.map((p) => p.chance);
  for (let i = 1; i < ch.length; i++) assert.ok(ch[i] <= ch[i - 1], "lägre chans vid högre pris " + ch.join(","));
  assert.ok(a.points.some((p) => p.current && p.price === 12000));
  assert.ok(a.wonMedian! < a.lostMedian!);
  assert.equal(priceAdvice(mk({ offer: { total: 5000, lines: [] } }), all.slice(0, 3), now).ok, false);
  assert.equal(kindOf(mk({ data: { size: "Flytt + flyttstäd – Premium" } })), "both");
});

test("PDF: en riktig fil, svenska tecken, inga tecken som typsnittet inte kan", async () => {
  assert.equal(pdfSafe("Åsa → Örebro 😀 ≈ 3 m³"), "Åsa -> Örebro  ca  3 m³");
  const b = mk({ offer: { total: 12500, lines: [{ label: "Flytt 2 pers", amount: 12500 }] }, validUntil: "2026-12-01", token: "tok",
    intro: { text: "Hej Anna!\nVi ses 🚚", uid: "owner", name: "Ammar", title: "Flyttkonsult", phone: "076-300 07 23", at: 1 },
    extras: [{ id: "x", label: "Flyttstädning", price: 2500 }] });
  const pdf = await offerPdf(b, { orgNr: "559000-0000", fskatt: true, insured: true, insurer: "Trygg-Hansa" });
  assert.equal(Buffer.from(pdf.slice(0, 5)).toString(), "%PDF-");
  assert.ok(pdf.length > 3000);
});
