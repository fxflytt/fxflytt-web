// Bookings, stored in Upstash Redis.
//   fx:b:<id>    booking JSON
//   fx:idx       sorted set of ids by creation time
//   fx:t:<token> id, for the customer's offer link
import { randomBytes, createHash } from "node:crypto";
import { kv, kvPipe } from "./kv.ts";
import type { OfferData } from "../mail/offerEmail.ts";

export type Status = "new" | "sent" | "signed" | "declined" | "done" | "cancelled";
export const STATUSES: Status[] = ["new", "sent", "signed", "declined", "done", "cancelled"];

export type Offer = {
  total: number;
  lines: { label: string; amount: number }[];
  note?: string;
  notIncluded?: string[];
  custom?: boolean;        // price set by hand – the calculator lines no longer apply
  customerNote?: string;   // shown to the customer on the offer
};

export type Booking = {
  id: string;
  createdAt: number;
  updatedAt: number;
  status: Status;
  source: "web" | "admin";
  data: OfferData;
  offer?: Offer;
  date?: string;           // agreed moving date YYYY-MM-DD
  time?: string;           // start time HH:MM
  durationH?: number;      // planned job length in hours (unset = estimated, see public/fx-schedule.js)
  crew?: string[];         // ids of the staff and vehicles on the job (lib/booking/team.ts) – internal only
  adminNote?: string;
  token?: string;
  sentAt?: number;
  signedAt?: number;
  declinedAt?: number;
  extras?: Extra[];        // optional add-ons the customer can tick in the offer (price after RUT)
  extrasChosen?: string[]; // ids the customer ticked when signing (already added to offer.total)
  views?: number;          // times the customer opened the offer link
  firstViewAt?: number;
  lastViewAt?: number;
  reminders?: number[];    // when reminders were e-mailed (reset when the offer is sent again)
  decline?: { reason: DeclineReason; text?: string };
  discount?: { pct: number; before: number; at: number };
  signature?: { name: string; pnr?: string; orgnr?: string; ip: string; ua: string; at: number; offerHash: string; terms: string };
  history: { at: number; what: string }[];
};

export type Extra = { id: string; label: string; price: number };
export type DeclineReason = "price" | "other_company" | "date" | "no_move" | "other";
export const DECLINE_REASONS: Record<DeclineReason, string> = {
  price: "Priset är för högt", other_company: "Valt en annan flyttfirma", date: "Datumet passar inte",
  no_move: "Flyttar inte längre", other: "Annat",
};

const K = { b: (id: string) => `fx:b:${id}`, idx: "fx:idx", t: (t: string) => `fx:t:${t}` };
export const TERMS_VERSION = "villkor-2026-11-12";

function newId(now: number) {
  const d = new Date(now).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }).replace(/-/g, "").slice(2);
  return `FX${d}-${randomBytes(3).toString("hex").toUpperCase()}`;
}

export function offerHash(b: Booking) {
  return createHash("sha256").update(JSON.stringify([b.id, b.offer?.total, b.offer?.lines, b.offer?.customerNote, b.date, b.time])).digest("hex").slice(0, 16);
}

export async function createBooking(source: Booking["source"], data: OfferData, extra: Partial<Booking> = {}): Promise<Booking> {
  const now = Date.now();
  const b: Booking = {
    id: newId(now), createdAt: now, updatedAt: now, status: "new", source, data,
    offer: data.price ? { total: data.price.total, lines: data.price.lines, note: data.price.note, notIncluded: data.price.notIncluded } : undefined,
    date: /^\d{4}-\d{2}-\d{2}$/.test(data.date || "") ? data.date : undefined,
    history: [{ at: now, what: source === "web" ? "Förfrågan från hemsidan" : "Skapad manuellt" }],
    ...extra,
  };
  await kvPipe([["SET", K.b(b.id), JSON.stringify(b)], ["ZADD", K.idx, now, b.id]]);
  return b;
}

export async function getBooking(id: string): Promise<Booking | null> {
  if (!/^FX\d{6}-[0-9A-F]{6}$/.test(id)) return null;
  const s = await kv<string | null>(["GET", K.b(id)]);
  return s ? (JSON.parse(s) as Booking) : null;
}

export async function saveBooking(b: Booking, what?: string) {
  b.updatedAt = Date.now();
  if (what) b.history.push({ at: b.updatedAt, what });
  if (b.history.length > 60) b.history = b.history.slice(-60);
  await kv(["SET", K.b(b.id), JSON.stringify(b)]);
}

export async function listBookings(limit = 400): Promise<Booking[]> {
  const ids = await kv<string[]>(["ZREVRANGE", K.idx, 0, limit - 1]);
  if (!ids?.length) return [];
  const vals = await kv<(string | null)[]>(["MGET", ...ids.map(K.b)]);
  return vals.filter(Boolean).map((s) => JSON.parse(s!) as Booking);
}

export async function issueToken(b: Booking): Promise<string> {
  if (b.token) return b.token;
  b.token = randomBytes(24).toString("base64url");
  await kv(["SET", K.t(b.token), b.id]);
  return b.token;
}

export async function bookingByToken(t: string): Promise<Booking | null> {
  if (!/^[A-Za-z0-9_-]{32}$/.test(t)) return null;
  const id = await kv<string | null>(["GET", K.t(t)]);
  return id ? getBooking(id) : null;
}

// What the customer may see – never notes, IPs or history.
export function publicView(b: Booking) {
  const d = b.data;
  return {
    id: b.id, status: b.status, date: b.date || d.date || "", time: b.time || "",
    name: d.name, from: d.from, to: d.to, distanceKm: d.distanceKm, size: d.size, areaM2: d.areaM2, home: d.home,
    floorFrom: d.floorFrom, floorTo: d.floorTo, extras: d.extras || [],
    offer: b.offer ? {
      total: b.offer.total, lines: b.offer.custom ? [] : b.offer.lines, note: b.offer.note,
      notIncluded: b.offer.notIncluded || [], customerNote: b.offer.customerNote || "",
    } : null,
    signedAt: b.signedAt || null, signedName: b.signature?.name || null,
    discount: b.discount && b.offer ? { pct: b.discount.pct, before: b.discount.before } : null,
    addons: b.status === "signed" || b.status === "done" ? [] : (b.extras || []),
    addonsChosen: (b.extras || []).filter((e) => b.extrasChosen?.includes(e.id)),
  };
}

// Price discount (admin): base is the price before any earlier discount.
export function applyDiscount(b: Booking, pct: number) {
  if (!b.offer) throw new Error("Ingen offert");
  const before = b.discount ? b.discount.before : b.offer.total;
  const lines = b.offer.lines.filter((l) => !/^Rabatt /.test(l.label));
  const off = Math.round((before * pct) / 100);
  b.offer = { ...b.offer, lines: pct > 0 ? [...lines, { label: `Rabatt ${pct} %`, amount: -off }] : lines, total: before - off };
  b.discount = pct > 0 ? { pct, before, at: Date.now() } : undefined;
  return b;
}

// Which reminder (1 or 2) is due now, or 0. The check runs once a day (morning), so "one day" means
// at least 20 h after sending and "three days" at least 68 h after.
export function reminderDue(b: Booking, now = Date.now()): 0 | 1 | 2 {
  if (b.status !== "sent" || !b.sentAt || !b.token || !b.data.email) return 0;
  if (b.date && b.date < new Date(now).toISOString().slice(0, 10)) return 0;
  const n = b.reminders?.length || 0, age = now - b.sentAt;
  if (n === 0 && age >= 20 * 3_600_000) return 1;
  if (n === 1 && age >= 68 * 3_600_000) return 2;
  return 0;
}

// Adds the add-ons the customer ticked to the offer (lines + total). Returns the chosen extras.
export function applyExtras(b: Booking, ids: unknown): Extra[] {
  const want = Array.isArray(ids) ? new Set(ids.filter((x) => typeof x === "string")) : new Set<string>();
  const chosen = (b.extras || []).filter((e) => want.has(e.id));
  if (!b.offer || !chosen.length) { b.extrasChosen = []; return []; }
  b.offer = { ...b.offer, lines: [...b.offer.lines, ...chosen.map((e) => ({ label: `Tillval: ${e.label}`, amount: e.price }))], total: b.offer.total + chosen.reduce((a, e) => a + e.price, 0) };
  b.extrasChosen = chosen.map((e) => e.id);
  return chosen;
}
