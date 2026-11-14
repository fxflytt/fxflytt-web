import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

// In-memory stand-in for Upstash (GET/SET only – the team list is one key).
const db = new Map<string, string>();
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
globalThis.fetch = (async (_url: string, init: RequestInit) => {
  const [cmd, k, v] = JSON.parse(String(init.body));
  const result = cmd === "SET" ? (db.set(k, v), "OK") : cmd === "GET" ? db.get(k) ?? null : null;
  return new Response(JSON.stringify({ result }), { status: 200 });
}) as typeof fetch;

const { schedule } = await import("../lib/booking/schedule.ts");
const team = await import("../lib/booking/team.ts");
beforeEach(() => db.clear());

const R = [
  { id: "RA", kind: "person", name: "Ahmad", color: "#000000", active: true, createdAt: 0 },
  { id: "RB", kind: "person", name: "Sara", color: "#000000", active: true, createdAt: 0 },
  { id: "RT", kind: "vehicle", name: "Lastbil 1", color: "#000000", active: true, createdAt: 0 },
] as any[];
const job = (id: string, o: any) => ({ id, status: "signed", data: { name: "Kund " + id }, ...o });

test("beräknad tid: timmar i prisraderna, annars boyta + körtid", () => {
  assert.equal(schedule.estimateHours({ offer: { total: 0, lines: [{ label: "2 flyttare + bil, 4 tim × 595 kr", amount: 2380 }] } } as any), 4);
  assert.equal(schedule.estimateHours({ data: { areaM2: "50" } } as any), 4);             // 2 + 50/25
  assert.equal(schedule.estimateHours({ data: { areaM2: "60", distanceKm: 350 } } as any), 9.5); // 4.4 + 5 → 9.5
  assert.equal(schedule.estimateHours({ data: { areaM2: "80", size: "Bara flyttstäd" } } as any), 4);
  assert.equal(schedule.estimateHours({ data: {} } as any), 4);
  assert.equal(schedule.hoursOf({ durationH: 6.5, data: { areaM2: "50" } } as any), 6.5);
});

test("krock: samma person på överlappande jobb samma dag", () => {
  const a = job("A", { date: "2026-12-05", time: "08:00", durationH: 4, crew: ["RA", "RT"] });
  const b = job("B", { date: "2026-12-05", time: "11:00", durationH: 3, crew: ["RA", "RB"] });
  const c = job("C", { date: "2026-12-05", time: "12:00", durationH: 3, crew: ["RT"] });  // börjar när A slutar
  const all = [a, b, c];
  const cs = schedule.conflicts(b, all, R);
  assert.deepEqual(cs.map((x) => [x.resourceId, x.bookingId, x.from, x.to]), [["RA", "A", "08:00", "12:00"]]);
  assert.equal(schedule.conflicts(c, all, R).length, 0);
});

test("krock: jobb utan starttid blockerar hela dagen, avbokade blockerar inte", () => {
  const a = job("A", { date: "2026-12-05", crew: ["RB"] });
  const b = job("B", { date: "2026-12-05", time: "16:00", durationH: 2, crew: ["RB"] });
  assert.equal(schedule.conflicts(b, [a, b], R)[0].from, "hela dagen");
  assert.equal(schedule.conflicts(b, [{ ...a, status: "cancelled" }, b], R).length, 0);
  assert.equal(schedule.conflicts(b, [{ ...a, date: "2026-12-06" }, b], R).length, 0);
  assert.equal(schedule.conflicts({ ...b, crew: [] }, [a, b], R).length, 0);
});

test("personal och fordon: lägg till, ändra, arkivera; färger delas ut", async () => {
  const c = team.cleanResource({ kind: "person", name: "  Ahmad  ", phone: "070-111 22 33", role: "Flyttledare" });
  assert.ok("ok" in c);
  const a = await team.addResource((c as any).ok);
  const t = await team.addResource({ kind: "vehicle", name: "Lastbil 1" });
  assert.match(a.id, /^R[0-9A-F]{8}$/); assert.equal(a.name, "Ahmad"); assert.notEqual(a.color, t.color);
  assert.deepEqual("error" in team.cleanResource({ kind: "boss", name: "x" }), true);
  assert.deepEqual("error" in team.cleanResource({ kind: "person", name: " " }), true);
  await team.updateResource(a.id, { active: false, id: "hack" } as any);
  const list = await team.listResources();
  assert.equal(list.length, 2); assert.equal(list[0].id, a.id); assert.equal(list[0].active, false);
  assert.equal(await team.updateResource("nope", { name: "x" }), null);
});

const report = await import("../lib/booking/report.ts");
test("timrapport: uppmätt tid före planerad, bara bokade jobb i månaden", () => {
  const H = 36e5, t0 = Date.parse("2026-12-05T08:00:00Z");
  const all: any[] = [
    job("A", { date: "2026-12-05", time: "08:00", durationH: 4, crew: ["RA", "RB", "RT"], status: "done", work: { startedAt: t0, finishedAt: t0 + 5.5 * H }, offer: { total: 5000, lines: [] } }),
    job("B", { date: "2026-12-07", time: "09:00", durationH: 3, crew: ["RA"], offer: { total: 3000, lines: [] } }),
    job("C", { date: "2026-12-08", time: "09:00", durationH: 3, crew: ["RA"], status: "cancelled" }),
    job("D", { date: "2026-11-30", time: "09:00", durationH: 3, crew: ["RA"] }),
  ];
  const rows = report.hoursReport(all, R, "2026-12");
  const a = rows.find((r) => r.id === "RA")!, b = rows.find((r) => r.id === "RB")!;
  assert.deepEqual([a.jobs, a.hours, a.realHours, a.plannedHours], [2, 8.5, 5.5, 3]);
  assert.deepEqual([b.jobs, b.hours], [1, 5.5]);
  assert.equal(rows.some((r) => r.id === "RT"), false);          // vehicles are not on the hours report
  const csv = report.hoursCsv(rows, "2026-12");
  assert.ok(csv.startsWith("﻿")); assert.match(csv, /"Ahmad";"";"2";"8,5";"5,5";"3"/);
  const m = report.moneyReport(all, "2026-12-06", 3);
  assert.deepEqual(m.months.map((x) => x.month), ["2026-10", "2026-11", "2026-12"]);
  assert.equal(m.thisMonth.done, 5000); assert.equal(m.thisMonth.booked, 8000); assert.equal(m.upcoming.total, 3000);
});

const settings = await import("../lib/booking/settings.ts");
test("omdöme: en gång, bara klara jobb med e-post, rätt dag, inte gamla jobb", async () => {
  await assert.rejects(settings.updateSettings({ reviewOn: true }), /länken/);
  await assert.rejects(settings.updateSettings({ reviewUrl: "https://evil.example/x" }), /Google/);
  const s = await settings.updateSettings({ reviewUrl: "https://g.page/r/abc/review", reviewOn: true, reviewDelayDays: 1 });
  assert.equal((await settings.getSettings()).reviewOn, true);
  const b = { status: "done", date: "2026-12-05", data: { email: "a@b.se" } } as any;
  assert.equal(settings.reviewDue(b, s, "2026-12-05"), false);       // same day, delay 1
  assert.equal(settings.reviewDue(b, s, "2026-12-06"), true);
  assert.equal(settings.reviewDue(b, s, "2026-12-25"), false);       // older than 14 days
  assert.equal(settings.reviewDue({ ...b, reviewSentAt: 1 }, s, "2026-12-06"), false);
  assert.equal(settings.reviewDue({ ...b, status: "signed" }, s, "2026-12-06"), false);
  assert.equal(settings.reviewDue({ ...b, data: {} }, s, "2026-12-06"), false);
  assert.equal(settings.reviewDue(b, { ...s, reviewOn: false }, "2026-12-06"), false);
});

const push = await import("../lib/booking/push.ts");
const webpush = (await import("web-push")).default;
const { createECDH, randomBytes } = await import("node:crypto");
test("push: nycklar skapas en gång, notisen krypteras, borttagna enheter rensas", async () => {
  const v1 = await push.vapid(), v2 = await push.vapid();
  assert.equal(v1.publicKey, v2.publicKey);
  const ecdh = createECDH("prime256v1"); ecdh.generateKeys();
  const keys = { p256dh: ecdh.getPublicKey().toString("base64url"), auth: randomBytes(16).toString("base64url") };
  await assert.rejects(push.addSub({ id: "owner", name: "Ägaren" }, { endpoint: "http://x", keys }, "Mac"), /Ogiltig/);
  await push.addSub({ id: "owner", name: "Ägaren" }, { endpoint: "https://push.example/a", keys }, "Mac");
  await push.addSub({ id: "U1", name: "Sara" }, { endpoint: "https://push.example/b", keys }, "Android");
  webpush.setVapidDetails("mailto:info@fxflytt.se", v1.publicKey, v1.privateKey);
  const req = webpush.generateRequestDetails({ endpoint: "https://push.example/a", keys }, JSON.stringify({ title: "t" }));
  assert.equal(req.method, "POST"); assert.match(String(req.headers.Authorization), /^vapid t=/);
  // the push service says device "b" is gone → it is removed, "a" stays
  const orig = webpush.sendNotification;
  (webpush as any).sendNotification = async (s: { endpoint: string }) => { if (s.endpoint.endsWith("/b")) throw Object.assign(new Error("gone"), { statusCode: 410 }); return {}; };
  try { assert.equal(await push.notifyAll({ title: "x", body: "y", url: "/admin" }), 1); }
  finally { (webpush as any).sendNotification = orig; }
  assert.deepEqual((await push.listSubs()).map((s) => s.userName), ["Ägaren"]);
});
