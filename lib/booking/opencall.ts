// "Vem kan jobba?" – the office asks the crew if someone can take a booked job.
// Sent to everyone with the crew app who is free that day (not on the job, not absent, no overlapping job).
// The first ones to answer yes are put on the job until enough people have said yes.
import { kv } from "./kv.ts";
import { getBooking, saveBooking, type Booking } from "./store.ts";
import { schedule } from "./schedule.ts";
import { activeOn, type Absence } from "./absence.ts";
import type { Resource } from "./team.ts";

// People who could take the job: with the app, active, not on it, not absent, no overlapping job.
export function eligible(b: Booking, all: Booking[], res: Resource[], abs: Absence[]): Resource[] {
  return res.filter((r) => r.kind === "person" && r.active && (r as { pinHash?: string }).pinHash && !(b.crew || []).includes(r.id)
    && !activeOn(abs, r.id, b.date || "").some((a) => a.status === "approved")
    && !schedule.conflicts({ ...b, crew: [r.id] }, all, res).length);
}

export async function ask(b: Booking, need: unknown, note: unknown, by: string, all: Booking[], res: Resource[], abs: Absence[]): Promise<Resource[]> {
  if (!(b.status === "signed") || !b.date) throw new Error("Bara bokade jobb med datum kan skickas ut.");
  const n = Math.round(Number(need));
  if (!(n >= 1 && n <= 6)) throw new Error("Hur många behövs: 1–6.");
  const people = eligible(b, all, res, abs);
  if (!people.length) throw new Error("Ingen med personalappen är ledig den dagen.");
  b.openCall = { need: n, note: typeof note === "string" ? note.trim().slice(0, 300) : "", at: Date.now(), by, asked: people.map((r) => r.id), yes: [], no: [] };
  await saveBooking(b, `Frågade personalen: ${n} behövs (skickat till ${people.map((r) => r.name).join(", ")})`, by);
  return people;
}

export async function cancel(b: Booking, by: string) {
  if (!b.openCall || b.openCall.closedAt) return;
  b.openCall.closedAt = Date.now();
  await saveBooking(b, "Frågan till personalen stängdes", by);
}

// One answer at a time per job (short lock), so two people cannot take the last place.
export async function answer(id: string, me: Resource, yes: boolean, res: Resource[], allFresh: () => Promise<Booking[]>, abs: Absence[]):
  Promise<{ b: Booking; took: boolean; full: boolean }> {
  const lock = "fx:lock:" + id;
  for (let i = 0; i < 20 && !(await kv(["SET", lock, "1", "NX", "EX", 10])); i++) await new Promise((r) => setTimeout(r, 150));
  try {
    const b = await getBooking(id);
    const oc = b?.openCall;
    if (!b || !oc || !oc.asked.includes(me.id)) throw new Error("Jobbet finns inte längre.");
    if (oc.closedAt || b.status !== "signed") throw new Error("Jobbet är redan tillsatt.");
    if (oc.yes.includes(me.id) || oc.no.includes(me.id)) throw new Error("Du har redan svarat.");
    if (!yes) { oc.no.push(me.id); await saveBooking(b, `${me.name} kan inte ta jobbet`); return { b, took: false, full: false }; }
    if (activeOn(abs, me.id, b.date!).some((a) => a.status === "approved")) throw new Error("Du är ledig den dagen.");
    if (schedule.conflicts({ ...b, crew: [me.id] }, await allFresh(), res).length) throw new Error("Du har redan ett annat jobb samtidigt.");
    oc.yes.push(me.id); b.crew = [...new Set([...(b.crew || []), me.id])];
    const full = oc.yes.length >= oc.need;
    if (full) oc.closedAt = Date.now();
    await saveBooking(b, `${me.name} tog jobbet via personalappen` + (full ? " – alla platser tillsatta" : ""));
    return { b, took: true, full };
  } finally { await kv(["DEL", lock]); }
}
