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
      summary: "Sammanfattning", needsReply: !/nyhetsbrev/i.test(user), draft: "Hej! Tack för ditt mejl.",
      extracted: { name: "Lisa Lind", phone: "070-123 45 67", from: "Kungsör", to: "Arboga", date: "2026-12-12", size: "2 rok" } };
  } else if (system.includes("klagomålsansvarig")) {
    out = { category: "damage", severity: "high", summary: "Spegel trasig", nextStep: "Ring kunden", draft: "Hej, vi beklagar…" };
  } else if (system.includes("säljare på FX Flytt")) {
    out = { subject: "Din flytt till Arboga", body: "Hej Lisa!\n\nVi håller datumet åt dig.", tip: "Ring henne i eftermiddag" };
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
  assert.equal(per.bookingId, b.id); assert.equal(per.category, "klagomal"); assert.equal(per.status, "new"); assert.ok(per.complaintId);
  assert.equal(per.draft, "Hej, vi beklagar…");      // the complaints desk's reply replaces the quick draft
  const lisa = list.find((m) => m.from === "lisa@ex.se")!;
  assert.equal(lisa.extracted?.to, "Arboga"); assert.equal(lisa.bookingId, undefined);
  const c = (await K.listComplaints())[0];
  assert.equal(c.bookingId, b.id); assert.equal(c.severity, "high"); assert.equal(c.mailId, per.id);
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
