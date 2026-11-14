// Absence and availability of people who go out on jobs.
//   off       "Kan inte jobba" – the person tells which days they are not available (no approval needed)
//   vacation  "Semester/ledigt" – a request the office approves or rejects
//   sick      "Sjuk" – reported, counts at once; the office gets a notification
// Stored as one JSON list in Upstash: fx:abs. Entries older than 400 days are dropped when saving.
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type AbsKind = "off" | "vacation" | "sick";
export const ABS_KINDS: Record<AbsKind, string> = { off: "Kan inte jobba", vacation: "Semester / ledigt", sick: "Sjuk" };
export type AbsStatus = "pending" | "approved" | "rejected";
export type Absence = {
  id: string; rid: string; name: string; kind: AbsKind; from: string; to: string; note: string;
  status: AbsStatus; createdAt: number; createdBy: string; decidedAt?: number; decidedBy?: string;
};
const KEY = "fx:abs";
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const day = (n = 0) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function listAbsences(): Promise<Absence[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Absence[]) : [];
}
async function saveAll(l: Absence[]) {
  const keep = day(-400);
  await kv(["SET", KEY, JSON.stringify(l.filter((a) => a.to >= keep))]);
}

// Counts on a date: approved (any kind) – pending vacation is shown as "asked for" but does not block.
export const activeOn = (l: Absence[], rid: string, date: string) =>
  l.filter((a) => a.rid === rid && a.status !== "rejected" && a.from <= date && a.to >= date);

export async function addAbsence(p: { id: string; name: string }, d: Record<string, unknown>, by: string, byOffice = false): Promise<Absence> {
  const kind = d.kind as AbsKind;
  if (!(kind in ABS_KINDS)) throw new Error("Välj typ av frånvaro.");
  const from = typeof d.from === "string" && DATE.test(d.from) ? d.from : kind === "sick" ? day(0) : "";
  const to = typeof d.to === "string" && DATE.test(d.to) ? d.to : from;
  if (!from) throw new Error("Välj från vilket datum.");
  if (to < from) throw new Error("Till-datumet är före från-datumet.");
  if (!byOffice && to < day(-1)) throw new Error("Datumet har redan passerat.");
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 92) throw new Error("Högst 3 månader åt gången.");
  const list = await listAbsences();
  if (list.filter((a) => a.rid === p.id && a.status === "pending").length >= 10) throw new Error("Du har redan många väntande ansökningar.");
  const a: Absence = {
    id: "A" + randomBytes(5).toString("hex"), rid: p.id, name: p.name, kind, from, to,
    note: typeof d.note === "string" ? d.note.trim().slice(0, 300) : "",
    status: kind === "vacation" && !byOffice ? "pending" : "approved", createdAt: Date.now(), createdBy: by,
  };
  list.push(a); await saveAll(list);
  return a;
}

export async function decide(id: string, ok: boolean, by: string): Promise<Absence> {
  const list = await listAbsences(), a = list.find((x) => x.id === id);
  if (!a) throw new Error("Finns inte.");
  a.status = ok ? "approved" : "rejected"; a.decidedAt = Date.now(); a.decidedBy = by;
  await saveAll(list);
  return a;
}

// The person may withdraw their own entry unless it is an approved absence that has already started.
export async function withdraw(id: string, rid: string | null): Promise<Absence> {
  const list = await listAbsences(), a = list.find((x) => x.id === id);
  if (!a || (rid && a.rid !== rid)) throw new Error("Finns inte.");
  if (rid && a.kind === "vacation" && a.status === "approved" && a.from <= day(0)) throw new Error("Ledigheten har redan börjat – ring kontoret.");
  await saveAll(list.filter((x) => x.id !== id));
  return a;
}
