// Veckorapporten – the sales analyst. Every Monday morning it counts last week (Monday–Sunday, Stockholm time):
// requests, offers sent, signed, lost and why, speed of the first answer, offers that are "hot" right now, complaints and
// e-mail. The numbers are counted by code (exact); the AI only writes the summary and three things to do this week.
// It is e-mailed to the office and kept in Statistik → Veckorapport.
//   fx:wr:<YYYY-Www>   one report (kept ~13 months)
//   fx:wri             sorted set of weeks
import { kv, kvPipe } from "../booking/kv.ts";
import { DECLINE_REASONS, type Booking, type DeclineReason } from "../booking/store.ts";
import { askJson, MODEL_WRITE, quote, type JsonSchema } from "./claude.ts";
import { sthlmDay } from "./complaints.ts";
import type { Complaint } from "./complaints.ts";
import type { InMail } from "./inbox.ts";

const won = (b: Booking) => b.status === "signed" || b.status === "done";
const total = (b: Booking) => b.offer?.total || 0;
const sum = (l: Booking[]) => l.reduce((a, b) => a + total(b), 0);
const median = (l: number[]) => { if (!l.length) return null; const s = [...l].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();

// Monday of the week before `today` (both YYYY-MM-DD), and ISO week label.
export function lastWeek(today: string): { from: string; to: string; label: string } {
  const t = new Date(today + "T12:00:00Z"), dow = (t.getUTCDay() + 6) % 7;          // 0 = Monday
  const mon = new Date(t.getTime() - (dow + 7) * 864e5), sun = new Date(mon.getTime() + 6 * 864e5);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10), label: isoWeek(mon) };
}
export function isoWeek(d: Date): string {
  const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  x.setUTCDate(x.getUTCDate() + 3 - ((x.getUTCDay() + 6) % 7));
  const y = x.getUTCFullYear(), w1 = new Date(Date.UTC(y, 0, 4));
  const w = 1 + Math.round(((x.getTime() - w1.getTime()) / 864e5 - 3 + ((w1.getUTCDay() + 6) % 7)) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}
const shift = (d: string, n: number) => new Date(new Date(d + "T12:00:00Z").getTime() + n * 864e5).toISOString().slice(0, 10);

export type WeekNumbers = {
  week: string; from: string; to: string;
  requests: number; web: number; manual: number; fromCalc: number;
  sent: number; sentValue: number; signed: number; signedValue: number; lost: number; lostReasons: { reason: string; n: number }[];
  winRate: number | null;            // signed / (signed + lost) this week, %
  responseMedianMin: number | null; answeredWithinHour: number | null; unanswered: number;
  openOffers: number; openValue: number;
  hot: { id: string; name: string; total: number; views: number; lastViewAt?: number }[];
  bySeller: { name: string; sent: number; signed: number; value: number }[];
  towns: { town: string; n: number }[];
  jobsDone: number; doneValue: number; nextWeekJobs: number;
  complaints: { opened: number; high: number; open: number };
  mail: { total: number; byCat: Record<string, number>; unanswered: number };
  prev: { requests: number; signed: number; signedValue: number; sent: number };
};

export function weekNumbers(all: Booking[], from: string, to: string, label: string, now: number,
  complaints: Complaint[] = [], mails: InMail[] = []): WeekNumbers {
  const inW = (t?: number, a = from, b = to) => !!t && sthlmDay(t) >= a && sthlmDay(t) <= b;
  const pf = shift(from, -7), pt = shift(to, -7);
  const req = all.filter((b) => inW(b.createdAt) && !b.prevId);
  const sent = all.filter((b) => inW(b.sentAt)), signed = all.filter((b) => won(b) && inW(b.signedAt));
  const lost = all.filter((b) => b.status === "declined" && inW(b.declinedAt) && !b.nextId);
  const reasons = new Map<string, number>();
  for (const b of lost) { const r = DECLINE_REASONS[(b.decline?.reason || "other") as DeclineReason] || "Annat"; reasons.set(r, (reasons.get(r) || 0) + 1); }
  const resp = req.filter((b) => b.source === "web" && b.firstResponseAt).map((b) => (b.firstResponseAt! - b.createdAt) / 6e4);
  const open = all.filter((b) => b.status === "sent" && !b.signedAt && !(b.sentAt && now - b.sentAt > 14 * 864e5) && !(b.date && b.date <= sthlmDay(now)));
  const sellers = new Map<string, { sent: number; signed: number; value: number }>();
  for (const b of sent) { const k = b.sentBy || "Okänd"; const x = sellers.get(k) || { sent: 0, signed: 0, value: 0 }; x.sent++; sellers.set(k, x); }
  for (const b of signed) { const k = b.sentBy || "Okänd"; const x = sellers.get(k) || { sent: 0, signed: 0, value: 0 }; x.signed++; x.value += total(b); sellers.set(k, x); }
  const towns = new Map<string, number>();
  for (const b of req) for (const t of [town(b.data.from)]) if (t) towns.set(t, (towns.get(t) || 0) + 1);
  const done = all.filter((b) => b.status === "done" && b.date && b.date >= from && b.date <= to);
  const nf = shift(to, 1), nt = shift(to, 7);
  const kIn = complaints.filter((c) => inW(c.createdAt));
  const mIn = mails.filter((m) => inW(m.date));
  const byCat: Record<string, number> = {};
  for (const m of mIn) byCat[m.category] = (byCat[m.category] || 0) + 1;
  return {
    week: label, from, to,
    requests: req.length, web: req.filter((b) => b.source === "web").length, manual: req.filter((b) => b.source !== "web").length, fromCalc: req.filter((b) => b.lead === "calc").length,
    sent: sent.length, sentValue: sum(sent), signed: signed.length, signedValue: sum(signed), lost: lost.length,
    lostReasons: [...reasons].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    winRate: signed.length + lost.length ? Math.round((signed.length * 100) / (signed.length + lost.length)) : null,
    responseMedianMin: resp.length ? Math.round(median(resp)!) : null,
    answeredWithinHour: resp.length ? Math.round((resp.filter((m) => m <= 60).length * 100) / resp.length) : null,
    unanswered: all.filter((b) => b.status === "new" && b.source === "web" && !b.firstResponseAt && !b.lead).length,
    openOffers: open.length, openValue: sum(open),
    hot: open.filter((b) => b.views).sort((a, b) => (b.lastViewAt || 0) - (a.lastViewAt || 0)).slice(0, 6)
      .map((b) => ({ id: b.id, name: b.data.name, total: total(b), views: b.views || 0, lastViewAt: b.lastViewAt })),
    bySeller: [...sellers].map(([name, x]) => ({ name, ...x })).sort((a, b) => b.value - a.value || b.sent - a.sent),
    towns: [...towns].map(([town, n]) => ({ town, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    jobsDone: done.length, doneValue: sum(done),
    nextWeekJobs: all.filter((b) => won(b) && b.date && b.date >= nf && b.date <= nt).length,
    complaints: { opened: kIn.length, high: kIn.filter((c) => c.severity === "high").length, open: complaints.filter((c) => c.status !== "closed").length },
    mail: { total: mIn.length, byCat, unanswered: mails.filter((m) => m.status === "new").length },
    prev: {
      requests: all.filter((b) => inW(b.createdAt, pf, pt) && !b.prevId).length,
      sent: all.filter((b) => inW(b.sentAt, pf, pt)).length,
      signed: all.filter((b) => won(b) && inW(b.signedAt, pf, pt)).length,
      signedValue: sum(all.filter((b) => won(b) && inW(b.signedAt, pf, pt))),
    },
  };
}

export type Analysis = { headline: string; summary: string; good: string[]; watch: string[]; actions: string[] };
export type WeekReport = { week: string; createdAt: number; numbers: WeekNumbers; analysis: Analysis | null; aiError?: string; emailedAt?: number };

const SCHEMA: JsonSchema = {
  type: "object", additionalProperties: false, required: ["headline", "summary", "good", "watch", "actions"],
  properties: {
    headline: { type: "string", description: "En mening, max 12 ord, om veckan." },
    summary: { type: "string", description: "3–5 meningar på svenska till ägaren: hur veckan gick jämfört med veckan innan och varför." },
    good: { type: "array", items: { type: "string" }, description: "1–3 saker som gick bra." },
    watch: { type: "array", items: { type: "string" }, description: "1–3 risker eller saker att hålla koll på (obesvarade, tappade affärer, klagomål)." },
    actions: { type: "array", items: { type: "string" }, description: "Exakt 3 konkreta saker att göra denna vecka, gärna med namn på kunder från listan över heta offerter." },
  },
};

export async function analyse(n: WeekNumbers, goalPerMonth: number): Promise<Analysis> {
  const a = await askJson<Analysis>({
    model: MODEL_WRITE, effort: "medium", schema: SCHEMA, maxTokens: 6000,
    system: `Du är försäljningsanalytiker åt FX Flytt AB, en flyttfirma i Mälardalen. Du får veckans siffror (räknade av systemet – de stämmer)
och skriver en kort, rak veckorapport på svenska till ägaren. Använd bara siffrorna i underlaget, räkna inte om dem och hitta inte på något.
Belopp är i kronor efter RUT. Skriv enkelt, utan facktermer.`,
    user: quote("underlag", JSON.stringify({ ...n, salesGoalPerMonth: goalPerMonth || null })),
  });
  const s = (v: unknown, k: number) => (typeof v === "string" ? v.trim().slice(0, k) : "");
  const l = (v: unknown) => (Array.isArray(v) ? v.map((x) => s(x, 300)).filter(Boolean).slice(0, 4) : []);
  return { headline: s(a.headline, 160), summary: s(a.summary, 1500), good: l(a.good), watch: l(a.watch), actions: l(a.actions) };
}

export async function saveReport(r: WeekReport) {
  await kvPipe([["SET", `fx:wr:${r.week}`, JSON.stringify(r), "EX", 400 * 86400], ["ZADD", "fx:wri", Date.parse(r.numbers.from), r.week]]);
}
export async function getReport(week: string): Promise<WeekReport | null> {
  if (!/^\d{4}-W\d{2}$/.test(week)) return null;
  const s = await kv<string | null>(["GET", `fx:wr:${week}`]);
  return s ? JSON.parse(s) : null;
}
export async function listWeeks(): Promise<string[]> {
  return kv<string[]>(["ZREVRANGE", "fx:wri", 0, 59]);
}

// ---------- e-mail to the office ----------
const kr = (n: number) => Math.round(n).toLocaleString("sv-SE").replace(/ | /g, " ") + " kr";
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const diff = (a: number, b: number) => (b ? ` (${a >= b ? "+" : ""}${a - b} mot förra veckan)` : "");

export function reportEmail(r: WeekReport, adminUrl: string) {
  const n = r.numbers, a = r.analysis;
  const subject = `Veckorapport ${n.week.replace("-W", " v.")}: ${n.signed} signerade, ${kr(n.signedValue)}`;
  const rows: [string, string][] = [
    ["Nya förfrågningar", `${n.requests}${diff(n.requests, n.prev.requests)}`],
    ["Offerter skickade", `${n.sent} · ${kr(n.sentValue)}`],
    ["Signerade", `${n.signed} · ${kr(n.signedValue)}${diff(n.signed, n.prev.signed)}`],
    ["Förlorade", `${n.lost}${n.lostReasons.length ? " – " + n.lostReasons.map((x) => `${x.reason} (${x.n})`).join(", ") : ""}`],
    ["Vinstandel", n.winRate == null ? "–" : n.winRate + " %"],
    ["Svarstid (median)", n.responseMedianMin == null ? "–" : `${n.responseMedianMin} min · ${n.answeredWithinHour} % inom en timme`],
    ["Öppna offerter nu", `${n.openOffers} · ${kr(n.openValue)}`],
    ["Utförda jobb", `${n.jobsDone} · ${kr(n.doneValue)} · ${n.nextWeekJobs} jobb nästa vecka`],
    ["Klagomål", `${n.complaints.opened} nya${n.complaints.high ? `, ${n.complaints.high} allvarliga` : ""} · ${n.complaints.open} öppna`],
    ["E-post till info@", `${n.mail.total} · ${n.mail.unanswered} obesvarade`],
  ];
  const list = (t: string, l: string[]) => (l.length ? `<h3 style="margin:18px 0 6px;font-size:15px;color:#0d2a3f">${t}</h3><ul style="margin:0;padding-left:20px">${l.map((x) => `<li style="margin:4px 0">${esc(x)}</li>`).join("")}</ul>` : "");
  const html = `<!DOCTYPE html><html lang="sv"><body style="margin:0;background:#f5f7f9;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#14212b">
<div style="max-width:620px;margin:0 auto;padding:20px 12px"><div style="background:#fff;border:1px solid #e3e8ed;border-radius:16px;padding:22px 24px">
<div style="font-size:12px;font-weight:700;color:#c2560a">VECKORAPPORT ${esc(n.week)} · ${esc(n.from)} – ${esc(n.to)}</div>
<h1 style="margin:6px 0 10px;font-size:21px;color:#0d2a3f">${esc(a?.headline || "Veckans försäljning")}</h1>
${a ? `<p style="margin:0 0 6px;line-height:22px">${esc(a.summary)}</p>` : ""}
<table style="width:100%;border-collapse:collapse;margin:14px 0;font-size:14px">${rows.map(([k, v]) => `<tr><td style="padding:7px 0;border-bottom:1px solid #e3e8ed;color:#5b6b78">${esc(k)}</td><td style="padding:7px 0;border-bottom:1px solid #e3e8ed;text-align:right;font-weight:600">${esc(v)}</td></tr>`).join("")}</table>
${a ? list("Bra", a.good) + list("Håll koll på", a.watch) + list("Att göra denna vecka", a.actions) : ""}
${n.hot.length ? list("Heta offerter (kunden har öppnat)", n.hot.map((h) => `${h.name} · ${kr(h.total)} · öppnad ${h.views} gånger`)) : ""}
<p style="margin:20px 0 0"><a href="${esc(adminUrl)}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:#ff7a1a;color:#fff;font-weight:800;text-decoration:none">Öppna adminpanelen</a></p>
</div><div style="color:#9aa8b4;font-size:11px;padding:12px">Skickad automatiskt av FX Flytts AI-team varje måndag. Stäng av i Inställningar → AI-teamet.</div></div></body></html>`;
  const text = [`Veckorapport ${n.week} (${n.from} – ${n.to})`, a ? `\n${a.headline}\n\n${a.summary}` : "", "", ...rows.map(([k, v]) => `${k}: ${v}`),
    a?.actions.length ? "\nAtt göra denna vecka:\n" + a.actions.map((x) => "- " + x).join("\n") : "", `\n${adminUrl}`].join("\n");
  return { subject, html, text };
}
