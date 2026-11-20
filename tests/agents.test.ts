// AI-teamet: inbox sorting, complaints, the closing e-mail and the weekly report – with fake storage and a fake Claude.
import { test } from "node:test";
import assert from "node:assert/strict";

const S = new Map<string, string>(), Z = new Map<string, Map<string, number>>(), SETS = new Map<string, Set<string>>();
function run(c: string[]): unknown {
  const [cmd, ...a] = c;
  switch (cmd) {
    case "SET": if (a.includes("NX") && S.has(a[0])) return null; S.set(a[0], a[1]); return "OK";
    case "GET": return S.get(a[0]) ?? null;
    case "DEL": S.delete(a[0]); return 1;
    case "EXPIRE": return 1;
    case "INCR": case "DECR": { const n = Number(S.get(a[0]) || 0) + (cmd === "INCR" ? 1 : -1); S.set(a[0], String(n)); return n; }
    case "LPUSH": { const l = JSON.parse(S.get("L:" + a[0]) || "[]"); l.unshift(...a.slice(1)); S.set("L:" + a[0], JSON.stringify(l)); return l.length; }
    case "LTRIM": { const l = JSON.parse(S.get("L:" + a[0]) || "[]"); S.set("L:" + a[0], JSON.stringify(l.slice(Number(a[1]), Number(a[2]) + 1))); return "OK"; }
    case "LRANGE": { const l = JSON.parse(S.get("L:" + a[0]) || "[]"); return l.slice(Number(a[1]), Number(a[2]) + 1); }
    case "MGET": return a.map((k) => S.get(k) ?? null);
    case "SADD": { const s = SETS.get(a[0]) ?? new Set(); const had = s.has(a[1]); s.add(a[1]); SETS.set(a[0], s); return had ? 0 : 1; }
    case "ZADD": { const m = Z.get(a[0]) ?? new Map(); m.set(a[2], Number(a[1])); Z.set(a[0], m); return 1; }
    case "ZREM": for (const x of a.slice(1)) Z.get(a[0])?.delete(x); return 1;
    case "ZREVRANGE": { const l = [...(Z.get(a[0]) ?? new Map()).entries()].sort((x, y) => y[1] - x[1]).map((e) => e[0]); const end = Number(a[2]); return l.slice(Number(a[1]), end < 0 ? undefined : end + 1); }
  }
  throw new Error("cmd " + cmd);
}
process.env.KV_REST_API_URL = "https://kv.test"; process.env.KV_REST_API_TOKEN = "t";
process.env.ANTHROPIC_API_KEY = "sk-ant-test"; process.env.SMTP_USER = "info@fxflytt.se";

const claudeCalls: { model: string; system: string; user: string; body: Record<string, unknown> }[] = [];
function fakeClaude(body: Record<string, unknown>) {
  const system = (body.system as { text: string }[])[0].text, user = (body.messages as { content: string }[])[0].content;
  claudeCalls.push({ model: String(body.model), system, user, body });
  let out: unknown;
  if (system.includes("sorterar inkommande")) {
    const complaint = /trasig|klaga/i.test(user);
    out = { category: complaint ? "klagomal" : /offert|flytta/i.test(user) ? "offert" : "leverantor", priority: complaint ? "high" : "normal",
      summary: "Sammanfattning", needsReply: !/nyhetsbrev/i.test(user), autoSafe: !complaint, draft: "Hej! Tack för ditt mejl.",
      extracted: { name: /Per Holm/.test(user) ? "Per Holm" : "Lisa Lind", phone: "070-123 45 67", from: "Kungsör", to: "Arboga", date: /FX\d{6}-|12 december/.test(user) ? "2026-12-12" : "", size: "2 rok", areaM2: /60 m²/.test(user) ? 60 : 0, service: "move" } };
  } else if (system.includes("skriver ett svar på ett mejl till info@")) {
    out = { draft: "Hej! Svar från Elsa.", note: /INGEN BEKRÄFTAD BOKNING/.test(user) ? "Osäker koppling till bokning" : "" };
  } else if (system.includes("klagomålsansvarig")) {
    out = { category: "damage", severity: "high", summary: "Spegel trasig", nextStep: "Ring kunden", draft: "Hej, vi beklagar…" };
  } else if (system.includes("säljare på FX Flytt") || system.includes("bästa säljare")) {
    out = { subject: "Din flytt till Arboga", body: "Hej Lisa!\n\nVi håller datumet åt dig.", tip: "Ring henne i eftermiddag", skills: ["spegla", "litet_ja", "hittepa"] };
  } else if (system.includes("försäljningsanalytiker")) {
    out = { headline: "Bra vecka", summary: "Fler signerade.", good: ["a"], watch: ["b"], actions: ["1", "2", "3"] };
  } else out = { draft: "Nytt utkast" };
  return { content: [{ type: "text", text: JSON.stringify(out) }], stop_reason: "end_turn" };
}
globalThis.fetch = (async (url: string, init: RequestInit) => {
  const body = JSON.parse(String(init.body));
  if (String(url).startsWith("https://api.anthropic.com")) return new Response(JSON.stringify(fakeClaude(body)), { status: 200 });
  const out = String(url).endsWith("/pipeline") ? body.map((x: string[]) => ({ result: run(x) })) : { result: run(body) };
  return new Response(JSON.stringify(out), { status: 200 });
}) as typeof fetch;

const store = await import("../lib/booking/store.ts");
const inbox = await import("../lib/agents/inbox.ts");
const K = await import("../lib/agents/complaints.ts");
const sales = await import("../lib/agents/sales.ts");
const weekly = await import("../lib/agents/weekly.ts");
const { askJson, MODEL_FAST } = await import("../lib/agents/claude.ts");
const { cleanText } = await import("../lib/mail/imap.ts");
const { buildMessage } = await import("../lib/mail/smtp.ts");
import type { RawMail } from "../lib/mail/imap.ts";

const raw = (uid: number, p: Partial<RawMail>): RawMail => ({ uid, messageId: `<m${uid}@ex>`, inReplyTo: "", references: [], from: "x@ex.se", fromName: "X",
  to: "info@fxflytt.se", subject: "Hej", date: Date.now() - 1000 * uid, text: "", attachments: [], ...p });

test("inkorgen: sorterar, hittar bokningen, gör klagomål och skippar egna mejl", async () => {
  const b = await store.createBooking("web", { name: "Per Holm", phone: "070-1", email: "per@ex.se", from: "Köping", to: "Västerås" });
  const mails = [
    raw(11, { from: "lisa@ex.se", fromName: "Lisa Lind", subject: "Offert", text: "Hej, vi vill flytta från Kungsör till Arboga 12 december. Mitt personnummer är 19850101-1234." }),
    raw(12, { from: "per@ex.se", fromName: "Per Holm", subject: "Trasig spegel", text: "Er personal gjorde min spegel trasig, jag vill klaga." }),
    raw(13, { from: "info@fxflytt.se", subject: "Ny offert – Åsa", text: "kopia från hemsidan" }),
  ];
  const notified: string[] = [];
  const fetchNew = async (st: unknown, max?: number) => { assert.equal(st, null); assert.equal(max, 10); return { mails, uidValidity: "7", lastUid: 13, more: false }; };
  const r = await inbox.syncInbox({ fetchNew, keepDays: 30, notify: async (m) => { notified.push(m.category); } });
  assert.equal(r.read, 3); assert.equal(r.saved, 2); assert.equal(r.complaints, 1);
  assert.deepEqual(notified.sort(), ["klagomal", "offert"]);
  // personal numbers never reach the AI
  const tri = claudeCalls.find((c) => c.user.includes("Kungsör till Arboga"))!;
  assert.equal(tri.model, MODEL_FAST); assert.ok(!tri.user.includes("19850101-1234")); assert.ok(tri.user.includes("[borttaget nummer]"));
  assert.equal((tri.body.output_config as { format: { type: string } }).format.type, "json_schema");
  const list = await inbox.listMails();
  assert.equal(list.length, 2);
  const per = list.find((m) => m.from === "per@ex.se")!;
  // Same e-mail address but no moving date in the mail: only a possible match – nothing from the booking goes to the customer.
  assert.equal(per.bookingId, undefined); assert.equal(per.maybeBookingId, b.id); assert.match(per.matchNote!, /inte bekräftad/); assert.equal(per.note, per.matchNote);
  assert.equal(per.category, "klagomal"); assert.equal(per.status, "new"); assert.ok(per.complaintId);
  assert.equal(per.draft, "Hej, vi beklagar…");      // the complaints desk's reply replaces the quick draft
  assert.ok(!claudeCalls.filter((x) => x.user.includes("spegel")).some((x) => x.user.includes("Köping")));   // booking details never reach the AI
  const lisa = list.find((m) => m.from === "lisa@ex.se")!;
  assert.equal(lisa.extracted?.to, "Arboga"); assert.equal(lisa.bookingId, undefined); assert.equal(lisa.draft, "Hej! Svar från Elsa.");
  const c = (await K.listComplaints())[0];
  assert.equal(c.bookingId, undefined); assert.equal(c.severity, "high"); assert.equal(c.mailId, per.id);
  assert.deepEqual(await inbox.getState().then((s) => [s.uidValidity, s.lastUid, s.lastError]), ["7", 13, ""]);
  // the same messages again: nothing new; a call soon after is skipped
  const again = await inbox.syncInbox({ fetchNew: async () => ({ mails, uidValidity: "7", lastUid: 13, more: false }), keepDays: 30 });
  assert.equal(again.saved, 0);
  const soon = await inbox.syncInbox({ fetchNew: async () => { throw new Error("should not run"); }, keepDays: 30, minGapMs: 60_000 });
  assert.equal(soon.skipped, "recent");
});

test("inkorgen: ett fel från e-postservern sparas och låset släpps", async () => {
  const r = await inbox.syncInbox({ fetchNew: async () => { throw new Error("login failed"); }, keepDays: 30 });
  assert.equal(r.error, "login failed");
  assert.equal((await inbox.getState()).lastError, "login failed");
  assert.equal(S.has("fx:imap:lock"), false);
});

test("svar: samma tråd, Re: en gång, kundens text citerad", () => {
  const m = { subject: "SV: Flytt", fromName: "Lisa", from: "lisa@ex.se", date: Date.now(), text: "Hej\nkan ni tisdag?" } as Parameters<typeof inbox.replyEmail>[0];
  const e = inbox.replyEmail(m, "Hej Lisa!\n\nJa, tisdag går bra.");
  assert.equal(e.subject, "SV: Flytt"); assert.equal(inbox.replySubject("Flytt"), "Re: Flytt");
  assert.match(e.text, /> kan ni tisdag\?/);
  const msg = buildMessage({ from: "info@fxflytt.se", to: "lisa@ex.se", subject: e.subject, text: e.text, fromName: "FX Flytt", inReplyTo: "<a@ex>", references: ["<z@ex>"] });
  assert.match(msg, /\r\nIn-Reply-To: <a@ex>\r\n/); assert.match(msg, /\r\nReferences: <z@ex> <a@ex>\r\n/);
  assert.ok(msg.includes(Buffer.from("FX Flytt").toString("base64")));
});

test("citat och signaturer tas bort från mejlet", () => {
  assert.equal(cleanText("Hej!\nVi vill flytta.\n\nDen 3 nov. 2026 kl. 10:00 skrev FX Flytt <info@fxflytt.se>:\n> gammalt"), "Hej!\nVi vill flytta.");
  assert.equal(cleanText("Svar\n> citat\nmer"), "Svar\nmer");
});

test("klagomål: svarsdag hoppar över helgen, och avslut kräver lösning", async () => {
  const fri = Date.parse("2026-11-20T10:00:00Z");
  assert.equal(K.deadlineFor("high", fri), "2026-11-23");
  assert.equal(K.deadlineFor("low", fri), "2026-11-25");
  const c = await K.addComplaint({ source: "phone", name: "Eva", text: "Kom två timmar sent", assessment: null, by: "Ägaren" });
  assert.equal(c.severity, "medium"); assert.equal(c.category, "other");
  await assert.rejects(K.updateComplaint(c.id, (x) => K.applyPatch(x, { status: "closed" }), "Ägaren"), /hur det löstes/);
  const done = await K.updateComplaint(c.id, (x) => K.applyPatch(x, { status: "closed", resolution: "Bjöd på 500 kr" }), "Ägaren");
  assert.equal(done.status, "closed"); assert.match(done.log.at(-1)!.what, /Avslutad.*Bjöd på 500 kr/);
  assert.deepEqual(K.cleanAssessment({ category: "hack" as never, severity: "extreme" as never }).severity, "medium");
});

test("säljaren: rätt kunder först, och mejlet skrivs från offerten", async () => {
  const now = Date.now(), day = 864e5;
  const mk = async (name: string, p: Partial<import("../lib/booking/store.ts").Booking>) => ({ ...(await store.createBooking("admin", { name, phone: "1", email: name + "@ex.se" })), status: "sent" as const, token: "t" + name, sentAt: now - 2 * day, ...p });
  const hot = await mk("hot", { views: 3, lastViewAt: now - 3600e3 });
  const cold = await mk("cold", {});
  const no = await mk("no", { calls: [{ at: now, by: "x", outcome: "notinterested", note: "" }] });
  const old = await mk("old", { sentAt: now - 30 * day });
  const just = await mk("just", { views: 5, closings: [{ at: now - day, subject: "s", by: "x" }] });
  const l = sales.closingCandidates([cold, no, old, hot, just], now).map((x) => x.b.data.name);
  assert.deepEqual(l, ["hot", "cold"]);
  const ctx = sales.salesContext({ ...hot, offer: { total: 7900, lines: [{ label: "Flytt", amount: 7900 }] }, date: "2026-12-12" }, "2026-11-18");
  assert.match(ctx, /öppnat offerten 3 gång/); assert.match(ctx, /7900 kr/);
  const d = await sales.draftClosing(hot, "2026-11-18", "nämn lastbilen");
  assert.equal(d.subject, "Din flytt till Arboga"); assert.equal(d.tip, "Ring henne i eftermiddag");
  const call = claudeCalls.at(-1)!;
  assert.match(call.user, /<instruktion>\nnämn lastbilen/);
  assert.equal(call.body.fallbacks, "default");
});

test("veckorapporten: förra veckan räknas exakt (Stockholmstid)", () => {
  const w = weekly.lastWeek("2026-11-18");                     // a Wednesday
  assert.deepEqual(w, { from: "2026-11-09", to: "2026-11-15", label: "2026-W46" });
  assert.equal(weekly.lastWeek("2026-11-16").from, "2026-11-09");  // on Monday: the week that just ended
  assert.equal(weekly.isoWeek(new Date("2027-01-01T12:00:00Z")), "2026-W53");
  const t = (d: string, h = 10) => Date.parse(`${d}T${String(h).padStart(2, "0")}:00:00Z`);
  const B = (p: Record<string, unknown>) => ({ id: "FX1", createdAt: t("2026-11-01"), updatedAt: 0, status: "new", source: "web", data: { name: "A", phone: "1", from: "Gatan 1, 732 30 Arboga" }, history: [], ...p }) as never;
  const all = [
    B({ createdAt: t("2026-11-09", 8), source: "web", firstResponseAt: t("2026-11-09", 8) + 20 * 6e4 }),
    B({ createdAt: t("2026-11-15", 22, ), source: "web" }),                       // Sunday 23:00 in Stockholm – still this week
    B({ createdAt: t("2026-11-15", 23) }),                                     // Monday 00:00 in Stockholm – next week
    B({ status: "signed", sentAt: t("2026-11-10"), signedAt: t("2026-11-11"), offer: { total: 8000, lines: [] }, sentBy: "Sara" }),
    B({ status: "declined", sentAt: t("2026-11-02"), declinedAt: t("2026-11-12"), decline: { reason: "price" } }),
    B({ status: "signed", signedAt: t("2026-11-04"), offer: { total: 5000, lines: [] } }),
  ];
  const n = weekly.weekNumbers(all, w.from, w.to, w.label, t("2026-11-18"));
  assert.equal(n.requests, 2); assert.equal(n.signed, 1); assert.equal(n.signedValue, 8000); assert.equal(n.lost, 1);
  assert.deepEqual(n.lostReasons, [{ reason: "Priset är för högt", n: 1 }]);
  assert.equal(n.winRate, 50); assert.equal(n.responseMedianMin, 20); assert.equal(n.answeredWithinHour, 100);
  assert.equal(n.prev.signed, 1); assert.deepEqual(n.bySeller, [{ name: "Sara", sent: 1, signed: 1, value: 8000 }]);
  assert.deepEqual(n.towns, [{ town: "Arboga", n: 2 }]);
  const mail = weekly.reportEmail({ week: n.week, createdAt: 0, numbers: n, analysis: { headline: "Bra vecka", summary: "S", good: [], watch: [], actions: ["Ring <Anna>"] } }, "https://x/admin");
  assert.match(mail.subject, /2026 v\.46: 1 signerade/); assert.ok(mail.html.includes("Ring &lt;Anna&gt;"));
});

test("askJson: AI-fel blir begripliga", async () => {
  const schema = { type: "object" as const, properties: {}, required: [] as string[], additionalProperties: false as const };
  const f = (r: unknown, status = 200) => (async () => new Response(JSON.stringify(r), { status })) as unknown as typeof fetch;
  await assert.rejects(askJson({ model: MODEL_FAST, effort: "low", system: "s", user: "u", schema, fetchImpl: f({ content: [], stop_reason: "refusal" }) }), /ville inte/);
  await assert.rejects(askJson({ model: MODEL_FAST, effort: "low", system: "s", user: "u", schema, fetchImpl: f({ error: "x" }, 529) }), /Claude API 529/);
  await assert.rejects(askJson({ model: MODEL_FAST, effort: "low", system: "s", user: "u", schema, fetchImpl: f({ content: [{ type: "text", text: "{oops" }], stop_reason: "end_turn" }) }), /gick inte att läsa/);
});

const team = await import("../lib/agents/team.ts");
const { estimate, areaOf } = await import("../lib/agents/estimate.ts");
const { dailyPlan } = await import("../lib/agents/plan.ts");
const settings = await import("../lib/booking/settings.ts");
import PRICES from "../lib/pricing/prices.json" with { type: "json" };

test("Elsa: prisförslag från ort och boyta med samma prismotor som hemsidan", () => {
  assert.equal(areaOf("2 rok, 60 m²"), 60); assert.equal(areaOf("3:a 75 kvm"), 75); assert.equal(areaOf("2 rok"), null);
  const e = estimate({ name: "", phone: "", from: "Storgatan 1, Kungsör", to: "Arboga", date: "", size: "60 m2" }, PRICES)!;
  assert.equal(e.from, "Kungsör"); assert.equal(e.to, "Arboga"); assert.equal(e.m2, 60); assert.ok(e.bas! > 0); assert.ok(e.premium! > 0);
  const u = estimate({ name: "", phone: "", from: "Atlantis", to: "Arboga", date: "", size: "60 m2" }, PRICES)!;
  assert.equal(u.kmUnknown, true); assert.equal(u.km, null);        // unknown town: price without the km cost, and it says so
  assert.equal(estimate({ name: "", phone: "", from: "Kungsör", to: "Arboga", date: "", size: "60 m2", service: "piano" }, PRICES), null);
});

test("efter-steget körs för varje sorterat mejl och ändringar sparas", async () => {
  const seen: string[] = [];
  const r = await inbox.syncInbox({
    fetchNew: async () => ({ mails: [raw(21, { from: "ny@ex.se", subject: "Vill flytta", text: "Vi vill flytta, offert tack", messageId: "<n21@ex>" })], uidValidity: "7", lastUid: 21, more: false }),
    keepDays: 30, after: async (m, ctx) => { seen.push(m.category + ":" + (ctx.booking ? "b" : "-")); m.status = "answered"; m.autoReplied = true; },
  });
  assert.equal(r.saved, 1); assert.deepEqual(seen, ["offert:-"]); assert.equal(r.urgent.length, 0);   // answered → no notice
  const m = (await inbox.listMails()).find((x) => x.from === "ny@ex.se")!;
  assert.equal(m.status, "answered"); assert.equal(m.autoReplied, true); assert.equal(m.autoSafe, true);
});

test("Oskar: fem sorters kunder, var och en högst en gång", async () => {
  const now = Date.now(), day = 864e5, future = new Date(now + 10 * day).toISOString().slice(0, 10);
  const mk = async (name: string, p: Record<string, unknown>) => ({ ...(await store.createBooking("admin", { name, phone: "1", email: name + "@ex.se" })), ...p }) as import("../lib/booking/store.ts").Booking;
  const list = [
    await mk("calc", { lead: "calc", createdAt: now - 2 * day }),
    await mk("calcNo", { lead: "calc", createdAt: now - 2 * day, noMarketing: true }),
    await mk("win", { status: "declined", declinedAt: now - 3 * day, decline: { reason: "price" } }),
    await mk("winMoved", { status: "declined", declinedAt: now - 3 * day, decline: { reason: "no_move" } }),
    await mk("up", { status: "signed", date: future, offer: { total: 5000, lines: [{ label: "Flytt", amount: 5000 }] } }),
    await mk("upDone", { status: "signed", date: future, offer: { total: 9000, lines: [{ label: "Flytt", amount: 5000 }, { label: "Flyttstäd", amount: 3000 }, { label: "Packning", amount: 500 }, { label: "Flyttkartonger hyra", amount: 500 }] } }),
    await mk("revive", { status: "sent", token: "t", sentAt: now - 20 * day }),
    await mk("revived", { status: "sent", token: "t", sentAt: now - 20 * day, closings: [{ at: now - day, subject: "s", by: "x", kind: "revive" }] }),
  ];
  const c = sales.salesCandidates(list, now).map((x) => x.b.data.name + ":" + x.kind).sort();
  assert.deepEqual(c, ["calc:calc", "revive:revive", "up:upsell", "win:winback"]);
  assert.match(sales.salesCandidates(list, now).find((x) => x.kind === "upsell")!.why, /flyttstäd, packning, kartonger/);
});

test("Nils: dagens plan sätter det viktigaste först", () => {
  const today = "2026-11-18", now = Date.parse("2026-11-18T09:00:00Z");
  const B = (p: Record<string, unknown>) => ({ id: "FX1", createdAt: now, updatedAt: 0, status: "new", source: "web", data: { name: "Kim", phone: "1" }, history: [], ...p }) as never;
  const p = dailyPlan([B({}), B({ status: "sent", lastViewAt: now - 3600e3, views: 2, data: { name: "Ola", phone: "1" } }), B({ status: "sent", followUp: { at: "2026-11-18T10:00", note: "ville fundera", by: "x" }, data: { name: "Eva", phone: "1" } })],
    [{ status: "new", deadline: "2026-11-17", name: "Per" } as never], [], [], today, now);
  assert.deepEqual(p.items.map((i) => i.prio), [1, 1, 2, 2]);
  assert.match(p.items[0].text, /Per.*försenat/); assert.match(p.items[1].text, /Kim/); assert.match(p.items[2].text, /Ring Eva – ville fundera/);
  assert.equal(p.counts.hot, 1);
});

test("AI-teamet: namn, gräns per dag och logg", async () => {
  const s = await settings.updateSettings({ aiNames: { elsa: " Linnea ", oskar: "Johan" }, aiAuto: { reply: true, hack: true }, aiDailyMax: 2 });
  assert.equal(s.aiNames.elsa, "Linnea"); assert.equal(s.aiNames.maja, "Maja"); assert.equal(s.aiAuto.reply, true); assert.equal(s.aiAuto.followup, false);
  assert.equal(team.aiBy(s, "elsa"), "Linnea (AI)");
  await assert.rejects(settings.updateSettings({ aiNames: { nils: "  " } }), /namn/);
  assert.equal(await team.takeQuota(2), true); assert.equal(await team.takeQuota(2), true); assert.equal(await team.takeQuota(2), false);
  assert.equal(await team.sentToday(), 2);
  await team.logActivity({ agent: "oskar", what: "Skickade mejl" }); await team.logActivity({ agent: "elsa", what: "Läste mejl" });
  assert.deepEqual((await team.listActivity(5)).map((a) => a.agent), ["elsa", "oskar"]);
  assert.match(team.aiSignature("Linnea", "Kundservice"), /Linnea, kundservice på FX Flytt\n\(Digital assistent/);
});

const sms = await import("../lib/sms/send.ts");
const { nextAnswer } = await import("../lib/agents/instant.ts");
const { lostNumbers } = await import("../lib/agents/lost.ts");

test("SMS: bara svenska mobilnummer, rätt anrop till 46elks", async () => {
  assert.equal(sms.mobileE164("070-123 45 67"), "+46701234567"); assert.equal(sms.mobileE164("+46 73 123 45 67"), "+46731234567");
  assert.equal(sms.mobileE164("0046701234567"), "+46701234567"); assert.equal(sms.mobileE164("08-123 456 78"), null); assert.equal(sms.mobileE164(""), null);
  await assert.rejects(sms.sendSms("0701234567", "hej"), /inte inställt/);
  process.env.ELKS_API_USER = "u"; process.env.ELKS_API_PASSWORD = "p";
  let seen: { url: string; init: RequestInit } | null = null;
  const id = await sms.sendSms("070-123 45 67", "Hej Lisa!", (async (url: string, init: RequestInit) => { seen = { url, init }; return new Response('{"id":"s1"}'); }) as unknown as typeof fetch);
  assert.equal(id, "s1"); assert.equal(seen!.url, "https://api.46elks.com/a1/sms");
  const body = new URLSearchParams(String(seen!.init.body));
  assert.equal(body.get("to"), "+46701234567"); assert.equal(body.get("from"), "FXFlytt"); assert.equal(body.get("message"), "Hej Lisa!");
  assert.equal((seen!.init.headers as Record<string, string>).Authorization, "Basic " + Buffer.from("u:p").toString("base64"));
  delete process.env.ELKS_API_USER; delete process.env.ELKS_API_PASSWORD;
});

test("Oskar: andra uppföljningen och kunder utan e-post går som SMS", async () => {
  const now = Date.now(), day = 864e5;
  const base = { status: "sent" as const, token: "t", sentAt: now - 5 * day };
  const mk = async (name: string, data: Record<string, string>, p: Record<string, unknown> = {}) => ({ ...(await store.createBooking("admin", { name, phone: "", ...data })), ...base, ...p }) as import("../lib/booking/store.ts").Booking;
  const l = [
    await mk("mail", { email: "a@ex.se", phone: "0701111111" }),
    await mk("second", { email: "b@ex.se", phone: "0702222222" }, { closings: [{ at: now - 4 * day, subject: "s", by: "x", kind: "followup" }] }),
    await mk("onlyPhone", { phone: "0703333333" }),
    await mk("landline", { phone: "08-1234567" }),
  ];
  const c = Object.fromEntries(sales.salesCandidates(l, now).map((x) => [x.b.data.name, x.channel]));
  assert.deepEqual(c, { mail: "email", second: "sms", onlyPhone: "sms" });
});

test("Elsa: när offerten kommer (vardag före 16 = i dag)", () => {
  assert.equal(nextAnswer(new Date("2026-11-18T09:00:00Z")), "i dag");        // Wednesday 10:00
  assert.equal(nextAnswer(new Date("2026-11-18T17:00:00Z")), "i morgon");     // Wednesday 18:00
  assert.equal(nextAnswer(new Date("2026-11-20T16:30:00Z")), "på måndag");    // Friday 17:30
  assert.equal(nextAnswer(new Date("2026-11-22T10:00:00Z")), "på måndag");    // Sunday
});

test("Nils: varför vi förlorar – vunna mot förlorade", () => {
  const now = Date.parse("2026-11-18T12:00:00Z"), day = 864e5;
  const B = (p: Record<string, unknown>) => ({ id: "FX1", createdAt: now - 30 * day, updatedAt: 0, status: "sent", source: "web", data: { name: "A", phone: "1", from: "Gatan 1, Arboga", areaM2: "60" }, history: [], sentAt: now - 25 * day, ...p }) as never;
  const n = lostNumbers([
    B({ status: "signed", offer: { total: 6000, lines: [] }, firstResponseAt: now - 30 * day + 10 * 6e4, views: 2 }),
    B({ status: "declined", declinedAt: now - 20 * day, decline: { reason: "price", text: "För dyrt jämfört med annan firma" }, offer: { total: 9000, lines: [] }, firstResponseAt: now - 30 * day + 120 * 6e4 }),
    B({ status: "sent", offer: { total: 8000, lines: [] } }),                            // no answer for 25 days
    B({ status: "declined", nextId: "FX2", declinedAt: now - 20 * day }),                // replaced by a new version – not lost
    B({ sentAt: now - 200 * day, status: "declined" }),                                  // outside the period
  ], 90, now);
  assert.equal(n.offers, 3); assert.equal(n.won, 1); assert.equal(n.lost, 2); assert.equal(n.noAnswer, 1); assert.equal(n.winRate, 33);
  assert.deepEqual(n.reasons.map((r) => r.reason).sort(), ["Priset är för högt", "Svarade aldrig"]);
  assert.deepEqual(n.avgPrice, { won: 6000, lost: 8500 }); assert.deepEqual(n.responseMin, { won: 10, lost: 120 });
  assert.equal(n.neverOpened, 2); assert.equal(n.noFollowUp, 2); assert.deepEqual(n.towns, [{ key: "Arboga", won: 1, lost: 2, winRate: 33 }]);
  assert.deepEqual(n.quotes, ["För dyrt jämfört med annan firma"]);
});

const pb = await import("../lib/agents/playbook.ts");

test("Oskar lär sig av mejl som blev bokningar, och räknar sina resultat", () => {
  const now = Date.now(), day = 864e5;
  const B = (p: Record<string, unknown>) => ({ id: "FX1", createdAt: 0, updatedAt: 0, status: "signed", source: "web", data: { name: "A", phone: "1" }, history: [], ...p }) as never;
  const all = [
    B({ signedAt: now - 5 * day, closings: [{ at: now - 7 * day, subject: "Din flytt till Arboga", body: "Hej Lisa! …", by: "Oskar (AI)", kind: "followup" }] }),
    B({ signedAt: now - 5 * day, closings: [{ at: now - 40 * day, subject: "För gammal", body: "x", by: "x", kind: "followup" }] }),     // signed long after – not credited
    B({ signedAt: now - 1 * day, closings: [{ at: now - 2 * day, subject: "SMS: hej", by: "x", kind: "followup", sms: true }] }),         // SMS: counted, not an example
    B({ status: "sent", closings: [{ at: now - 3 * day, subject: "Inget svar", body: "y", by: "x", kind: "followup" }] }),
    B({ signedAt: now - 2 * day, closings: [{ at: now - 3 * day, subject: "Flyttstäd?", body: "z", by: "x", kind: "upsell" }] }),
  ];
  const ex = pb.winningExamples(all, "followup");
  assert.deepEqual(ex.map((e) => [e.subject, e.daysToSign]), [["Din flytt till Arboga", 2]]);
  assert.equal(pb.winningExamples(all, "").length, 2);
  const r = Object.fromEntries(pb.salesResults(all, now - 90 * day).map((x) => [x.kind, x]));
  assert.deepEqual([r.followup.sent, r.followup.won, r.followup.sms, r.followup.rate], [4, 2, 1, 50]);
  assert.deepEqual([r.upsell.sent, r.upsell.won], [1, 1]);
});

test("Oskar säger bara att dagen är full när kalendern faktiskt är full", () => {
  const B = (date: string, status = "signed") => ({ id: "FX1", createdAt: 0, updatedAt: 0, status, source: "web", data: { name: "A", phone: "1" }, history: [], date }) as never;
  const all = [B("2026-12-12"), B("2026-12-12"), B("2026-12-12"), B("2026-12-12", "sent"), B("2026-12-13")];
  assert.deepEqual(pb.dayLoad(all, "2026-12-12", 4), { jobs: 3, vehicles: 4, nearlyFull: true });
  assert.equal(pb.dayLoad(all, "2026-12-13", 4)!.nearlyFull, false);
  assert.equal(pb.dayLoad(all, undefined, 4), null);
  const t = sales.trainingText({ notes: "Vi är ett familjeföretag", examples: [{ kind: "followup", subject: "S", body: "B", daysToSign: 1 }], load: { jobs: 1, vehicles: 3, nearlyFull: false } }, "winback");
  assert.match(t, /SÅ SÄLJER DU/); assert.match(t, /VINN TILLBAKA/); assert.match(t, /<agarens_stil>\nVi är ett familjeföretag/); assert.match(t, /<exempel nr="1"/);
});

test("Oskars mejl skrivs med träningen och kalendern", async () => {
  const b = { ...(await store.createBooking("admin", { name: "Lisa Lind", phone: "1", email: "l@ex.se" })), status: "sent" as const, token: "t", sentAt: Date.now() - 2 * 864e5, date: "2026-12-12" };
  await sales.draftSales("followup", b, "2026-11-18", { training: { facts: "7 dagars städgaranti", notes: "Säg att vi är familjeföretag", load: { jobs: 3, vehicles: 4, nearlyFull: true } } });
  const call = claudeCalls.at(-1)!;
  assert.match(call.system, /städgaranti/); assert.match(call.system, /familjeföretag/); assert.match(call.user, /NÄSTAN FULL/);
  assert.equal((call.body.output_config as { effort: string }).effort, "high");
});

test("mejl utan ämne får ett riktigt ämne i svaret", () => {
  assert.equal(inbox.replySubject("(ingen rubrik)", { category: "offert", extracted: { name: "", phone: "", from: "Storgatan 1, Kungsör", to: "Arboga", date: "", size: "" } }), "Din flytt Kungsör–Arboga – FX Flytt");
  assert.equal(inbox.replySubject("", { category: "bokning" }), "Svar från FX Flytt");
  assert.equal(inbox.replySubject("Flytt i december"), "Re: Flytt i december");
  assert.equal(inbox.mailTitle({ subject: "(ingen rubrik)", summary: "Alax vill ha pris" }), "Alax vill ha pris");
});

test("prisförslaget hittar boytan i själva mejlet om AI:n missade den", () => {
  const e = { name: "", phone: "", from: "Kungsör", to: "Stockholm", date: "", size: "lägenhet" };
  assert.equal(estimate(e, PRICES), null);
  const x = estimate(e, PRICES, "Hej, vi har en lägenhet på 60 kvm och vill ha en prisuppskattning")!;
  assert.equal(x.m2, 60); assert.equal(x.to, "Stockholm"); assert.ok(x.bas! > 0);
  assert.equal(estimate({ ...e, areaM2: 75 }, PRICES)!.m2, 75);
});

test("granskningen: rätt bokning bara när den är säker, avgifter från bokningens datum", async () => {
  const today = "2026-11-18";
  const sara = { ...(await store.createBooking("web", { name: "Sara Holm", phone: "1", email: "same@ex.se" })), status: "signed" as const, date: "2026-12-15" };
  const all = [sara];
  // Ahmed writes from the same address about another booking on 5 December: not sure.
  const a = inbox.linkBooking({ from: "same@ex.se", fromName: "Ahmed", subject: "Ändra datum", text: "Vi vill flytta vår flytt den 5 december" }, { name: "Ahmed", date: "2026-12-05" } as never, all);
  assert.equal(a.sure, null); assert.equal(a.maybe?.id, sara.id);
  const block = inbox.bookingBlock(a, today);
  assert.match(block, /INGEN BEKRÄFTAD BOKNING/); assert.ok(!block.includes("2026-12-15")); assert.ok(!block.includes(sara.id)); assert.match(a.note, /inte bekräftad/);
  // "Ring mig" without anything: not sure either.
  assert.equal(inbox.linkBooking({ from: "same@ex.se", fromName: "", subject: "Ring mig", text: "Ring mig" }, { name: "", date: "" } as never, all).sure, null);
  // Name and date match → sure, with the days counted from the booking.
  const ok = inbox.linkBooking({ from: "same@ex.se", fromName: "Sara Holm", subject: "Avboka", text: "Vi vill avboka" }, { name: "Sara", date: "2026-12-15" } as never, all);
  assert.equal(ok.sure?.id, sara.id);
  assert.match(inbox.bookingBlock(ok, today), /Dagar kvar till flyttdagen enligt bokningen \(räknat av systemet\): 27\. .*KOSTNADSFRI/);
  assert.match(inbox.bookingBlock(ok, "2026-12-11"), /: 4\. .*10 %/);
  // The booking number in the e-mail is always enough.
  assert.equal(inbox.linkBooking({ from: "other@ex.se", fromName: "", subject: "Fråga", text: `Gäller ${sara.id}` }, undefined, all).sure?.id, sara.id);
});

test("granskningen: Elsas svar får prisförslag, regler och fakta från hemsidan", async () => {
  const est = estimate({ name: "", phone: "", from: "Västerås", to: "Västerås", date: "", size: "90 m²", service: "move" }, PRICES)!;
  assert.equal(est.sameTown, true); assert.deepEqual([est.bas, est.premium, est.deluxe], [5625, 8347, 9205]);
  const r = await inbox.writeReply({ from: "k@ex.se", fromName: "K", subject: "Paket", text: "Vad är skillnaden mellan paketen? 90 m² i Västerås", draft: "", extracted: undefined },
    { link: { sure: null, maybe: null, note: "" }, estimate: est, knowledge: (await import("../lib/agents/knowledge.ts")).knowledge(PRICES as never), today: "2026-11-18" });
  assert.equal(r.draft, "Hej! Svar från Elsa.");
  const call = claudeCalls.at(-1)!;
  assert.match(call.user, /Deluxe .*9 205 kr/); assert.match(call.system, /prisraknare/); assert.match(call.system, /Trygg-Hansa/);
  assert.match(call.system, /tullpapper/); assert.match(call.system, /Best regards/); assert.match(call.system, /flygel eller vanligt \(upprätt\) piano/);
  const c = estimate({ name: "", phone: "", from: "Köping", to: "", date: "", size: "58 kvm", service: "cleaning" }, PRICES)!;
  assert.equal(c.cleaning, 3100);
});

test("signaturen följer kundens språk", () => {
  assert.equal(team.replyLang("Hi John,\n\nYes, we can help you in English.\n\nBest regards\nFX Flytt"), "en");
  assert.equal(team.replyLang("Hej!\n\nVänliga hälsningar\nFX Flytt"), "sv");
  assert.match(team.aiSignature("Elsa", "Kundservice", "en"), /^Best regards\nElsa, FX Flytt customer service/);
});

test("Oskars säljfärdigheter: väljs per kund, mäts mot bokningar, bara sant socialt bevis", async () => {
  const now = Date.now(), day = 864e5;
  // The skills he used are kept (unknown ids dropped).
  const b = { ...(await store.createBooking("admin", { name: "Lisa Lind", phone: "1", email: "l@ex.se" })), status: "sent" as const, token: "t", sentAt: now - 2 * day };
  const d = await sales.draftSales("followup", b, "2026-11-18");
  assert.deepEqual(d.skills, ["spegla", "litet_ja"]);
  assert.match(claudeCalls.at(-1)!.system, /DINA SÄLJFÄRDIGHETER[\s\S]*litet_ja – Ett litet ja/);
  assert.ok(!/utvag – Ge en utväg/.test(claudeCalls.at(-1)!.system));            // "give an out" is not for a normal follow-up
  // Results per skill.
  const B = (p: Record<string, unknown>) => ({ id: "FX1", createdAt: 0, updatedAt: 0, status: "signed", source: "web", data: { name: "A", phone: "1" }, history: [], ...p }) as never;
  const all = [
    B({ signedAt: now - day, closings: [{ at: now - 3 * day, subject: "a", by: "x", kind: "followup", skills: ["spegla", "riskfritt"] }] }),
    B({ status: "sent", closings: [{ at: now - 3 * day, subject: "b", by: "x", kind: "followup", skills: ["spegla"] }] }),
  ];
  const r = Object.fromEntries(pb.skillResults(all).map((x) => [x.id, [x.used, x.won, x.rate]]));
  assert.deepEqual(r, { riskfritt: [1, 1, 100], spegla: [2, 1, 50] });
  // Social proof only from real finished jobs (at least 3).
  const done = (to: string) => B({ status: "done", date: new Date(now - 30 * day).toISOString().slice(0, 10), data: { name: "x", phone: "1", from: "Gatan 1, 731 30 Köping", to } });
  assert.equal(pb.townProof([done("Arboga"), done("Arboga")], "Köping"), "");
  assert.match(pb.townProof([done("Arboga"), done("Arboga"), done("Västerås")], "Köping"), /3 flyttar från eller till Köping/);
});

const outbox = await import("../lib/agents/outbox.ts");

test("testläge: mejlet märks med vem det skulle ha gått till, och kunden får inget", () => {
  const m = outbox.testMail("kund@ex.se", { subject: "Din flytt", text: "Hej!", html: "<!DOCTYPE html><html><body style=\"x\"><p>Hej!</p></body></html>" });
  assert.equal(m.subject, "[TEST → kund@ex.se] Din flytt");
  assert.match(m.text, /^TESTLÄGE – det här mejlet skulle ha skickats till kund@ex\.se/);
  assert.match(m.html, /<body style="x"><div style="[^"]*dashed[^"]*">TESTLÄGE/);
});

test("testläge sparas i inställningarna, med kontroll av adress och nummer", async () => {
  const s = await settings.updateSettings({ aiTestMode: true, aiTestTo: "Test@Ex.se", aiTestPhone: "070-123 45 67" });
  assert.equal(s.aiTestMode, true); assert.equal(s.aiTestTo, "test@ex.se"); assert.equal(s.aiTestPhone, "070-123 45 67");
  await assert.rejects(settings.updateSettings({ aiTestTo: "inte en adress" }), /Ogiltig/);
  await assert.rejects(settings.updateSettings({ aiTestPhone: "08-123 456" }), /mobilnummer/);
  await settings.updateSettings({ aiTestMode: false });
});

test("Majas bekräftelse följer kundens språk", () => {
  assert.equal(team.textLang("Hi, the movers broke my table and I am not happy with it. Please call me."), "en");
  assert.equal(team.textLang("Hej, ni har repat vårt bord och jag är inte nöjd med det."), "sv");
  assert.equal(team.textLang(""), "sv");
});

const vol = await import("../lib/agents/volume.ts");
const { refsOf } = await import("../lib/mail/imap.ts");

test("tillägg: ägarens regel – gratis upp till 2 m³ bara om det ryms i bokade bilar", () => {
  const B = (data: Record<string, unknown>, lines: string[] = []) => ({ id: "FX1", createdAt: 0, updatedAt: 0, status: "sent", source: "web", history: [],
    data: { name: "A", phone: "1", ...data }, offer: { total: 1, lines: lines.map((label) => ({ label, amount: 1 })) } }) as never;
  // Customer sent a list of 10 m³ (one truck): 5 boxes extra is fine.
  const small = vol.extraCheck(B({ volume: { m3: 10, items: 0, list: [] } }, ["Flytt 40 m² (1 flyttbil)"]), [{ id: "box", qty: 5 }])!;
  assert.equal(small.add, 0.3); assert.equal(small.free, true);
  // 10 m³ + 2 m³ of furniture: still free.
  assert.equal(vol.extraCheck(B({ volume: { m3: 10, items: 0, list: [] } }, ["Flytt 40 m² (1 flyttbil)"]), [{ id: "sofa3", qty: 1 }])!.free, true);
  // Already 20 m³ on one 20 m³ truck: even one box is not promised free.
  const full = vol.extraCheck(B({ volume: { m3: 20, items: 0, list: [] } }, ["Flytt 60 m² (1 flyttbil)"]), [{ id: "box", qty: 1 }])!;
  assert.equal(full.free, false); assert.match(full.reason, /nästan full/);
  // 70 boxes = 4.2 m³: more than 2 m³ → the office checks.
  const many = vol.extraCheck(B({ areaM2: "40" }, ["Flytt 40 m² (1 flyttbil)"]), [{ id: "box", qty: 70 }])!;
  assert.equal(many.add, 4.2); assert.equal(many.free, false); assert.match(vol.extraText(many), /lova INTE att det ingår/);
  // Unknown thing: the AI's own estimate is used.
  assert.equal(vol.itemsM3([{ id: "other", qty: 2, label: "Hundbur", m3: 0.3 }]).m3, 0.6);
});

test("svar på vårt mejl kopplas till offerten, även när namnet inte stämmer", async () => {
  const b = { ...(await store.createBooking("admin", { name: "Anna Test", phone: "1", email: "ammar@ex.se" })), status: "sent" as const, token: "tok12345678" };
  const refs = refsOf("Hej! Ingår kartonger?\n\n> Se och signera offerten: https://www.fxflytt.se/signera?t=tok12345678");
  assert.deepEqual(refs.tokens, ["tok12345678"]);
  const l = inbox.linkBooking({ from: "ammar@ex.se", fromName: "Ammar", subject: "Re: Din flytt från Sundsvall till Örebro", text: "Ingår kartonger?", refs }, { name: "Ammar", date: "" } as never, [b]);
  assert.equal(l.sure?.id, b.id); assert.match(l.note, /svarar på vårt mejl/);
  // Someone else forwarding the link does not get the booking.
  assert.equal(inbox.linkBooking({ from: "other@ex.se", fromName: "X", subject: "Fwd", text: "", refs }, undefined, [b]).sure, null);
  // Not confirmed but looks like a reply to an offer: Elsa must not ask for everything again.
  assert.match(inbox.bookingBlock({ sure: null, maybe: b, note: "" }, "2026-11-20"), /be INTE om boyta, adresser och våning igen/);
});

test("Elsas svar får beslutet om tillägget och regeln om frågor med två betydelser", async () => {
  const b = { ...(await store.createBooking("admin", { name: "Ammar", phone: "1", email: "a@ex.se", areaM2: "40" })), status: "sent" as const, offer: { total: 4000, lines: [{ label: "Flytt 40 m² (1 flyttbil)", amount: 4000 }] } };
  const extra = vol.extraCheck(b, [{ id: "box", qty: 70 }]);
  await inbox.writeReply({ from: "a@ex.se", fromName: "Ammar", subject: "Re: offert", text: "Ingår flyttkartonger? Jag behöver omkring 70.", draft: "", extracted: undefined },
    { link: { sure: b, maybe: null, note: "" }, extra, today: "2026-11-20" });
  const call = claudeCalls.at(-1)!;
  assert.match(call.user, /TILLÄGG .*70 × Flyttkartong \(standard\)/); assert.match(call.user, /lova INTE att det ingår/);
  assert.match(call.system, /Kan en fråga betyda två saker/); assert.match(call.system, /erbjud att lägga till det i offerten/);
});

test("säljmejlet har en dold förhandsrad, så Gmail inte visar \"FX FX Flytt DIN OFFERT\"", async () => {
  const { personalOfferEmail } = await import("../lib/mail/bookingEmail.ts");
  const b = await store.createBooking("admin", { name: "Anna", phone: "1", email: "a@ex.se" });
  const m = personalOfferEmail(b, "Din flytt", "Hej Anna,\n\nTack för att du tittade på offerten.", "https://x/signera?t=1");
  assert.match(m.html, /<body[^>]*><div style="display:none[^>]*>Tack för att du tittade på offerten\./);
});

const scen = await import("../lib/agents/scenarios.ts");
const { OFFICE_RULES } = await import("../lib/agents/officerules.ts");

test("kontorets regler: med i det Elsa vet, och går före hemsidans text", async () => {
  const k = (await import("../lib/agents/knowledge.ts")).knowledge(PRICES as never);
  assert.ok(k.startsWith("KONTORETS REGLER"));
  for (const w of ["ALDRIG emot kontanter", "Ingen handpenning", "röda dagar", "avfrostade", "trafiktillstånd", "ALLTID kostnadsfritt", "besiktningsprotokoll", "förrådshyra", "bilder på sakerna"])
    assert.ok(OFFICE_RULES.includes(w), w);
});

test("flytta datum är gratis även nära flyttdagen; avbokning kostar 10 %", async () => {
  const b = { ...(await store.createBooking("admin", { name: "A", phone: "1", email: "a@ex.se" })), status: "signed" as const, date: "2026-11-23", time: "08:00" };
  const t = inbox.bookingBlock({ sure: b, maybe: null, note: "x" }, "2026-11-20");
  assert.match(t, /Att FLYTTA datumet är alltid kostnadsfritt/); assert.match(t, /AVBOKNING är belagd med 10 %/); assert.match(t, /Bokad starttid: kl\. 08:00/);
});

test("Elsas prov: 24 scenarier, kontrollerna fungerar", async () => {
  assert.equal(scen.SCENARIOS.length, 24);
  assert.equal(new Set(scen.SCENARIOS.map((s) => s.id)).size, 24);
  const s16 = scen.SCENARIOS.find((s) => s.id === "16")!;
  assert.deepEqual(scen.check(s16, "Det går bra att flytta datumet utan kostnad."), []);
  assert.equal(scen.check(s16, "Det kostar 10 % av priset.").length, 2);
  const s5 = scen.SCENARIOS.find((s) => s.id === "5a")!;
  assert.deepEqual(scen.check(s5, "Vi skickar en faktura efter jobbet med 10 dagars betalningstid. Kontanter tar vi inte emot."), []);
  // A run through the (fake) AI: every scenario gets an answer and a result.
  const r = await scen.runScenarios(PRICES as never, ["1a", "16", "21"]);
  assert.deepEqual(r.map((x) => x.id), ["1a", "16", "21"]);
  assert.ok(r.every((x) => x.reply && !x.error));
  assert.match(claudeCalls.at(-1)!.system, /KONTORETS REGLER/);
});
