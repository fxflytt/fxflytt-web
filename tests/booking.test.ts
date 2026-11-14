import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// In-memory stand-in for the Upstash REST API (only the commands the store uses).
const db = new Map<string, string>(); const z = new Map<string, Map<string, number>>();
function run(c: string[]): unknown {
  const [cmd, ...a] = c;
  switch (cmd) {
    case "SET": db.set(a[0], a[1]); return "OK";
    case "GET": return db.get(a[0]) ?? null;
    case "DEL": db.delete(a[0]); return 1;
    case "MGET": return a.map((k) => db.get(k) ?? null);
    case "ZADD": { const m = z.get(a[0]) ?? new Map(); m.set(a[2], Number(a[1])); z.set(a[0], m); return 1; }
    case "ZREVRANGE": { const m = z.get(a[0]) ?? new Map(); return [...m.entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]).slice(Number(a[1]), Number(a[2]) + 1); }
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  const out = String(url).endsWith("/pipeline") ? body.map((c: string[]) => ({ result: run(c) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

const store = await import("../lib/booking/store.ts");
const auth = await import("../lib/booking/auth.ts");
beforeEach(() => { db.clear(); z.clear(); });

const data = { name: "Anna Svensson", phone: "070-123 45 67", email: "anna@example.se", from: "Kungsör", to: "Örebro", date: "2026-12-05",
  price: { total: 3950, lines: [{ label: "Flytt 60 m²", amount: 3950 }] } };

test("skapar, listar och hämtar bokning", async () => {
  const b = await store.createBooking("web", data);
  assert.match(b.id, /^FX\d{6}-[0-9A-F]{6}$/);
  assert.equal(b.status, "new"); assert.equal(b.offer?.total, 3950); assert.equal(b.date, "2026-12-05");
  const list = await store.listBookings();
  assert.equal(list.length, 1);
  assert.equal((await store.getBooking(b.id))?.data.name, "Anna Svensson");
  assert.equal(await store.getBooking("../hack"), null);
});

test("token-länk hittar rätt bokning och visar inget internt", async () => {
  const b = await store.createBooking("web", data);
  b.adminNote = "hemlig"; const t = await store.issueToken(b); await store.saveBooking(b);
  assert.equal(t.length, 32);
  const found = await store.bookingByToken(t);
  assert.equal(found?.id, b.id);
  const v = store.publicView(found!) as Record<string, unknown>;
  assert.equal(JSON.stringify(v).includes("hemlig"), false);
  assert.equal("signature" in v, false);
  assert.equal(await store.bookingByToken("x".repeat(32)), null);
});

test("handpris döljer kalkylatorns rader för kunden", async () => {
  const b = await store.createBooking("web", data);
  b.offer = { ...b.offer!, total: 4500, custom: true, customerNote: "Inkl. montering" };
  const v = store.publicView(b);
  assert.deepEqual(v.offer?.lines, []); assert.equal(v.offer?.total, 4500); assert.equal(v.offer?.customerNote, "Inkl. montering");
});

test("inloggning: rätt lösenord ger giltig kaka, fel ger inte", () => {
  process.env.ADMIN_PASSWORD = "test-lösen-123";
  assert.equal(auth.passwordOk("fel"), false);
  assert.equal(auth.passwordOk("test-lösen-123"), true);
  const c = auth.sessionCookie().split(";")[0];
  assert.equal(auth.isAdmin(new Request("https://x/", { headers: { cookie: c } })), true);
  const forged = c.replace(/\.[^.]+$/, ".AAAA");
  assert.equal(auth.isAdmin(new Request("https://x/", { headers: { cookie: forged } })), false);
  process.env.ADMIN_PASSWORD = "nytt";
  assert.equal(auth.isAdmin(new Request("https://x/", { headers: { cookie: c } })), false);
});

import { normPnr } from "../lib/booking/pnr.ts";
test("personnummer validation", () => {
  assert.equal(normPnr("19811218-9876"), "19811218-9876");
  assert.equal(normPnr("811218-9876"), "19811218-9876");
  assert.equal(normPnr("198112189876"), "19811218-9876");
  assert.equal(normPnr("19811218-9875"), "");   // wrong check digit
  assert.equal(normPnr("19811318-9876"), "");   // bad month
  assert.equal(normPnr("abc"), "");
});

import { normOrgnr } from "../lib/booking/pnr.ts";
test("organisationsnummer validation", () => {
  assert.equal(normOrgnr("559278-6643"), "559278-6643");
  assert.equal(normOrgnr("5592786643"), "559278-6643");
  assert.equal(normOrgnr("559278-6644"), "");
  assert.equal(normOrgnr("551278-6643"), "");
});

import { applyDiscount, reminderDue } from "../lib/booking/store.ts";
test("discount: percent of the pre-discount price, replaces earlier discount", () => {
  const b: any = { offer: { total: 10000, lines: [{ label: "Flytt", amount: 10000 }] } };
  applyDiscount(b, 10);
  assert.equal(b.offer.total, 9000); assert.equal(b.discount.before, 10000);
  assert.deepEqual(b.offer.lines.at(-1), { label: "Rabatt 10 %", amount: -1000 });
  applyDiscount(b, 20);
  assert.equal(b.offer.total, 8000); assert.equal(b.offer.lines.length, 2);
  applyDiscount(b, 0);
  assert.equal(b.offer.total, 10000); assert.equal(b.discount, undefined); assert.equal(b.offer.lines.length, 1);
});
test("reminders: after ~1 day, then ~3 days, max two, only for sent offers with e-mail", () => {
  const H = 3_600_000, t0 = Date.parse("2026-11-13T10:00:00Z");
  const b: any = { status: "sent", sentAt: t0, token: "x", data: { email: "a@b.se" }, date: "2026-12-01", reminders: [] };
  assert.equal(reminderDue(b, t0 + 10 * H), 0);
  assert.equal(reminderDue(b, t0 + 23 * H), 1);
  b.reminders = [t0 + 23 * H];
  assert.equal(reminderDue(b, t0 + 47 * H), 0);
  assert.equal(reminderDue(b, t0 + 71 * H), 2);
  b.reminders.push(t0 + 71 * H);
  assert.equal(reminderDue(b, t0 + 200 * H), 0);
  assert.equal(reminderDue({ ...b, reminders: [], status: "declined" }, t0 + 30 * H), 0);
  assert.equal(reminderDue({ ...b, reminders: [], data: {} }, t0 + 30 * H), 0);
  assert.equal(reminderDue({ ...b, reminders: [], date: "2026-11-01" }, t0 + 30 * H), 0);
});

import { applyExtras } from "../lib/booking/store.ts";
test("extras: only offered ids are added to the offer", () => {
  const b: any = { offer: { total: 10000, lines: [] }, extras: [{ id: "e1", label: "Flyttstäd", price: 4500 }, { id: "e2", label: "Packning", price: 3570 }] };
  const c = applyExtras(b, ["e2", "x9", 5]);
  assert.equal(c.length, 1); assert.equal(b.offer.total, 13570); assert.deepEqual(b.extrasChosen, ["e2"]);
  assert.equal(b.offer.lines[0].label, "Tillval: Packning");
  const b2: any = { offer: { total: 5000, lines: [] }, extras: [] };
  applyExtras(b2, "nope"); assert.equal(b2.offer.total, 5000);
});

test("arbetsorder: egen länk, inget pris/e-post/intern anteckning, ny länk stänger den gamla", async () => {
  const b = await store.createBooking("web", { ...data, message: "Piano i källaren", floorFrom: "3 tr · ingen hiss" });
  b.adminNote = "kunden prutar"; b.crewNote = "Portkod 1234"; b.date = "2026-12-05"; b.time = "08:00"; b.durationH = 5; b.crew = ["RA", "RT"];
  const res = [{ id: "RA", kind: "person", name: "Ahmad", role: "Flyttledare", phone: "070-1" }, { id: "RT", kind: "vehicle", name: "Lastbil 1", phone: "x" }];
  const t1 = await store.issueWorkToken(b); await store.saveBooking(b);
  const ct = await store.issueToken(b);
  assert.notEqual(t1, ct);
  assert.equal((await store.bookingByToken(t1)), null);           // crew link never opens the customer's offer
  const v = store.workView((await store.bookingByWorkToken(t1))!, res);
  const s = JSON.stringify(v);
  for (const secret of ["3950", "anna@example.se", "kunden prutar", ct]) assert.equal(s.includes(secret), false, secret);
  assert.equal(v.end, "13:00"); assert.equal(v.crewNote, "Portkod 1234"); assert.equal(v.floorFrom, "3 tr · ingen hiss");
  assert.deepEqual(v.crew.map((c) => [c.name, c.phone]), [["Ahmad", "070-1"], ["Lastbil 1", ""]]);
  const t2 = await store.issueWorkToken(b, true);
  assert.notEqual(t1, t2);
  assert.equal(await store.bookingByWorkToken(t1), null);
  assert.equal((await store.bookingByWorkToken(t2))?.id, b.id);
});
