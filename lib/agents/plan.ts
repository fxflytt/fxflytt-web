// Nils' plan for the day: what the office should do first today, counted from the booking system.
// Made every morning by the daily job (and when the AI-team page is opened). No AI needed – exact and free.
import type { Booking } from "../booking/store.ts";
import type { Complaint } from "./complaints.ts";
import type { InMail } from "./inbox.ts";
import type { Candidate } from "./sales.ts";
import { SALES_KINDS } from "./sales.ts";

export type PlanItem = { prio: 1 | 2 | 3; text: string; href: string };
export type DayPlan = { date: string; madeAt: number; items: PlanItem[]; counts: { calls: number; hot: number; unanswered: number; mails: number; complaints: number; sales: number; jobs: number } };

export function dailyPlan(all: Booking[], complaints: Complaint[], mails: InMail[], sales: Candidate[], today: string, now = Date.now()): DayPlan {
  const items: PlanItem[] = [];
  const due = complaints.filter((c) => c.status !== "closed" && c.deadline <= today);
  for (const c of due.slice(0, 3)) items.push({ prio: 1, text: `Svara ${c.name || c.email} om klagomålet (${c.deadline < today ? "försenat" : "senast i dag"})`, href: "#klagomal" });
  const unanswered = all.filter((b) => b.status === "new" && b.source === "web" && !b.firstResponseAt && !b.lead);
  for (const b of unanswered.slice(0, 3)) items.push({ prio: 1, text: `Ny förfrågan från ${b.data.name} väntar på svar – ring inom en timme`, href: "#" + b.id });
  const calls = all.filter((b) => b.followUp && b.followUp.at.slice(0, 10) <= today && !["signed", "done", "cancelled", "declined"].includes(b.status));
  for (const b of calls.slice(0, 5)) items.push({ prio: 2, text: `Ring ${b.data.name}${b.followUp!.note ? " – " + b.followUp!.note : ""}`, href: "#" + b.id });
  const hot = all.filter((b) => b.status === "sent" && !b.signedAt && b.lastViewAt && now - b.lastViewAt < 2 * 864e5)
    .sort((a, b) => (b.lastViewAt || 0) - (a.lastViewAt || 0));
  for (const b of hot.slice(0, 3)) items.push({ prio: 2, text: `${b.data.name} tittade på offerten nyss (${b.views} gånger) – ring och fråga om något är oklart`, href: "#" + b.id });
  const newMails = mails.filter((m) => m.status === "new");
  if (newMails.length) items.push({ prio: 2, text: `${newMails.length} mejl att svara på i inkorgen`, href: "#inkorg" });
  const byKind = new Map<string, number>();
  for (const c of sales) byKind.set(c.kind, (byKind.get(c.kind) || 0) + 1);
  for (const [k, n] of byKind) items.push({ prio: 3, text: `${SALES_KINDS[k as keyof typeof SALES_KINDS].label}: ${n} kund${n > 1 ? "er" : ""}`, href: "#saljaren" });
  const jobs = all.filter((b) => (b.status === "signed" || b.status === "done") && b.date === today);
  return {
    date: today, madeAt: now, items: items.slice(0, 14),
    counts: { calls: calls.length, hot: hot.length, unanswered: unanswered.length, mails: newMails.length, complaints: due.length, sales: sales.length, jobs: jobs.length },
  };
}
