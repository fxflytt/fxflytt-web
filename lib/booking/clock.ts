// Stämpelklocka: people clock in when the working day starts and out when it ends, from the crew app.
// Only allowed within the radius around the office (owner setting). The phone's position is read once,
// when the button is pressed – nobody is tracked during the day. Stored with the stamp for checking.
//   fx:sh:<YYYY-MM>   hash  shiftId → Shift   (month of clocking in)
//   fx:open:<id>      the open shift of a person ("YYYY-MM|shiftId")
// The owner can add, correct and delete stamps in admin; every change is logged on the stamp.
import { randomBytes } from "node:crypto";
import { kv, kvPipe } from "./kv.ts";
import type { Settings } from "./settings.ts";

export type Loc = { lat: number; lon: number; acc: number; dist: number };
export type Shift = {
  id: string; rid: string; name: string; date: string;   // date = Stockholm date of clocking in
  in: number; out?: number; inLoc?: Loc; outLoc?: Loc;
  log: { at: number; by: string; what: string }[];
};

const sthlmDate = (t: number) => new Date(t).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
const MK = (month: string) => `fx:sh:${month}`, OK = (rid: string) => `fx:open:${rid}`;
const MAX_ACC = 250;   // metres – a less precise position is not accepted

export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }) {
  const R = 6371000, r = Math.PI / 180, dLa = (b.lat - a.lat) * r, dLo = (b.lon - a.lon) * r;
  const h = Math.sin(dLa / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLo / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

// Is the phone at the office? Uncertainty counts in the person's favour, up to MAX_ACC.
export function checkPlace(s: Settings, pos: { lat?: unknown; lon?: unknown; acc?: unknown }): { ok: true; loc: Loc } | { ok: false; error: string } {
  if (!s.clockOn || !s.office) return { ok: false, error: "Stämpelklockan är inte påslagen. Prata med kontoret." };
  const lat = Number(pos.lat), lon = Number(pos.lon), acc = Math.round(Number(pos.acc));
  if (!isFinite(lat) || !isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return { ok: false, error: "Telefonen gav ingen position. Tillåt plats för sidan och försök igen." };
  if (!(acc >= 0) || acc > MAX_ACC) return { ok: false, error: `Positionen är för osäker (±${isFinite(acc) ? acc : "?"} m). Gå ut eller nära ett fönster och försök igen.` };
  const dist = distanceM(s.office, { lat, lon });
  const loc = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5, acc, dist };
  if (dist - acc > s.clockRadiusM) {
    const km = dist >= 1000 ? (dist / 1000).toFixed(1).replace(".", ",") + " km" : dist + " m";
    return { ok: false, error: `Du är ${km} från kontoret. Du kan bara stämpla inom ${s.clockRadiusM} m. Ring kontoret om du behöver hjälp.` };
  }
  return { ok: true, loc };
}

export async function openShift(rid: string): Promise<Shift | null> {
  const ref = await kv<string | null>(["GET", OK(rid)]);
  if (!ref) return null;
  const [month, id] = ref.split("|");
  const s = await kv<string | null>(["HGET", MK(month), id]);
  return s ? (JSON.parse(s) as Shift) : null;
}

async function put(sh: Shift) {
  const month = sh.date.slice(0, 7), cmds: (string | number)[][] = [["HSET", MK(month), sh.id, JSON.stringify(sh)]];
  cmds.push(sh.out ? ["DEL", OK(sh.rid)] : ["SET", OK(sh.rid), `${month}|${sh.id}`]);
  await kvPipe(cmds);
}

export async function clockIn(p: { id: string; name: string }, loc: Loc, now = Date.now()): Promise<Shift> {
  const open = await openShift(p.id);
  if (open) throw new Error(`Du är redan instämplad sedan ${new Date(open.in).toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Stockholm" })}.`);
  const sh: Shift = { id: "S" + randomBytes(5).toString("hex"), rid: p.id, name: p.name, date: sthlmDate(now), in: now, inLoc: loc, log: [{ at: now, by: p.name, what: "Instämplad i appen" }] };
  await put(sh);
  return sh;
}

export async function clockOut(p: { id: string; name: string }, loc: Loc, now = Date.now()): Promise<Shift> {
  const sh = await openShift(p.id);
  if (!sh) throw new Error("Du är inte instämplad.");
  sh.out = now; sh.outLoc = loc; sh.log.push({ at: now, by: p.name, what: "Utstämplad i appen" });
  await put(sh);
  return sh;
}

export async function shiftsOf(month: string): Promise<Shift[]> {
  const h = await kv<string[]>(["HGETALL", MK(month)]);
  const out: Shift[] = [];
  for (let i = 1; i < (h || []).length; i += 2) out.push(JSON.parse(h[i]));
  return out.sort((a, b) => a.in - b.in);
}

export const hoursOf = (sh: Shift) => (sh.out ? (sh.out - sh.in) / 36e5 : 0);

// Owner corrections. `in`/`out` are "YYYY-MM-DDTHH:MM" in Stockholm time.
const parseLocal = (s: unknown): number | null => {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  // Stockholm is UTC+1 (winter) or UTC+2 (summer): try both and keep the one that reads back right.
  for (const off of [1, 2]) { const ts: number = Date.parse(s + ":00Z") - off * 36e5; if (new Date(ts).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm" }).replace(" ", "T").slice(0, 16) === s) return ts; }
  return null;
};

export async function saveShift(d: { id?: unknown; month?: unknown; rid: string; name: string; in?: unknown; out?: unknown }, by: string): Promise<Shift> {
  const tin = parseLocal(d.in), tout = d.out === "" || d.out == null ? null : parseLocal(d.out);
  if (tin == null) throw new Error("Ange när personen stämplade in.");
  if (d.out && tout == null) throw new Error("Ogiltig tid för utstämpling.");
  if (tout != null && tout <= tin) throw new Error("Utstämpling måste vara efter instämpling.");
  if (tout != null && tout - tin > 24 * 36e5) throw new Error("Ett pass kan inte vara längre än 24 timmar.");
  if (tin > Date.now() + 36e5) throw new Error("Tiden ligger i framtiden.");
  let sh: Shift | null = null;
  if (d.id) {
    const month = String(d.month || ""), s = await kv<string | null>(["HGET", MK(month), String(d.id)]);
    if (!s) throw new Error("Stämplingen finns inte.");
    sh = JSON.parse(s) as Shift;
    if (sh.date.slice(0, 7) !== sthlmDate(tin).slice(0, 7)) {   // moved to another month: remove from the old one
      await kv(["HDEL", MK(sh.date.slice(0, 7)), sh.id]);
    }
    const t = (x?: number) => (x ? new Date(x).toLocaleString("sv-SE", { timeZone: "Europe/Stockholm", dateStyle: "short", timeStyle: "short" }) : "–");
    sh.log.push({ at: Date.now(), by, what: `Ändrad: ${t(sh.in)}–${t(sh.out)} → ${t(tin)}–${t(tout ?? undefined)}` });
    sh.in = tin; sh.out = tout ?? undefined; sh.date = sthlmDate(tin);
  } else {
    if (tout == null && (await openShift(d.rid))) throw new Error(`${d.name} är redan instämplad.`);
    sh = { id: "S" + randomBytes(5).toString("hex"), rid: d.rid, name: d.name, date: sthlmDate(tin), in: tin, out: tout ?? undefined, log: [{ at: Date.now(), by, what: "Inlagd av kontoret" }] };
  }
  await put(sh);
  if (sh.out && (await kv<string | null>(["GET", OK(sh.rid)]))?.endsWith("|" + sh.id)) await kv(["DEL", OK(sh.rid)]);
  return sh;
}

export async function deleteShift(month: string, id: string): Promise<void> {
  const s = await kv<string | null>(["HGET", MK(month), id]);
  if (!s) throw new Error("Stämplingen finns inte.");
  const sh = JSON.parse(s) as Shift;
  await kv(["HDEL", MK(month), id]);
  if ((await kv<string | null>(["GET", OK(sh.rid)]))?.endsWith("|" + id)) await kv(["DEL", OK(sh.rid)]);
}
