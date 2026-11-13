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
  adminNote?: string;
  token?: string;
  sentAt?: number;
  signedAt?: number;
  declinedAt?: number;
  signature?: { name: string; pnr?: string; ip: string; ua: string; at: number; offerHash: string; terms: string };
  history: { at: number; what: string }[];
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
  };
}
