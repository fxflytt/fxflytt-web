// "Tipsa en vän". After the move the customer gets a code (e.g. ANNA-7K2Q).
// A friend who books with it gets refFriendKr off the offer; when the friend has signed, the customer who
// recommended is due the reward (refReward), which the office hands out and marks as given.
//   fx:ref:<CODE> → booking id of the customer who owns the code
import { randomInt } from "node:crypto";
import { kv } from "./kv.ts";
import { getBooking, saveBooking, type Booking } from "./store.ts";
import type { Settings } from "./settings.ts";

const ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";   // no 0/O, 1/I
export const normCode = (s: unknown) => (typeof s === "string" ? s.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 20) : "");
const digits = (p?: string) => String(p || "").replace(/\D/g, "").replace(/^46/, "0");

export async function issueCode(b: Booking): Promise<string> {
  if (b.refCode) return b.refCode;
  const first = (b.data.name || "KUND").split(" ")[0].normalize("NFD").replace(/[^A-Za-z]/g, "").toUpperCase().slice(0, 6) || "KUND";
  for (let i = 0; i < 10; i++) {
    const code = first + "-" + Array.from({ length: 4 }, () => ABC[randomInt(ABC.length)]).join("");
    if (await kv(["SET", "fx:ref:" + code, b.id, "NX"])) { b.refCode = code; return code; }
  }
  throw new Error("Kunde inte skapa en kod.");
}

// Adds the friend's discount to a new booking. Returns a message for the history, or throws.
export async function applyCode(b: Booking, raw: unknown, s: Settings): Promise<string> {
  const code = normCode(raw);
  if (!code) throw new Error("Skriv koden.");
  if (!s.refOn) throw new Error("Rabattkoder används inte just nu.");
  if (b.referral) throw new Error("Bokningen har redan en rabattkod.");
  if (b.signedAt) throw new Error("Offerten är redan signerad.");
  const id = await kv<string | null>(["GET", "fx:ref:" + code]);
  const from = id ? await getBooking(id) : null;
  if (!from) throw new Error("Koden finns inte.");
  if (from.id === b.id || (digits(from.data.phone) && digits(from.data.phone) === digits(b.data.phone)) || (from.data.email && from.data.email.toLowerCase() === (b.data.email || "").toLowerCase()))
    throw new Error("Koden är för vänner – inte för den som fick den.");
  b.referral = { code, fromId: from.id, fromName: from.data.name, kr: s.refFriendKr };
  if (b.offer && s.refFriendKr > 0) {
    const line = { label: `Rabattkod ${code} (tips från en vän)`, amount: -s.refFriendKr };
    b.offer = { ...b.offer, lines: [...b.offer.lines, line], total: Math.max(0, b.offer.total - s.refFriendKr) };
    if (b.packages) b.packages = b.packages.map((p) => ({ ...p, lines: [...p.lines, line], total: Math.max(0, p.total - s.refFriendKr) }));
  }
  return `Rabattkod ${code} från ${from.data.name}` + (s.refFriendKr ? ` (−${s.refFriendKr} kr)` : "");
}

// When the friend has signed: the customer who recommended is due the reward.
export async function rewardOnSign(b: Booking): Promise<Booking | null> {
  if (!b.referral || b.referral.rewardedAt) return null;
  const from = await getBooking(b.referral.fromId);
  b.referral.rewardedAt = Date.now();
  if (!from) return null;
  from.refRewards = [...(from.refRewards || []), { bookingId: b.id, name: b.data.name, at: Date.now() }];
  await saveBooking(from, `Belöning att ge: ${b.data.name} bokade med din kod ${b.referral.code}`);
  return from;
}

export async function markGiven(b: Booking, friendId: string, by: string) {
  const r = (b.refRewards || []).find((x) => x.bookingId === friendId && !x.givenAt);
  if (!r) throw new Error("Finns ingen belöning att ge.");
  r.givenAt = Date.now(); r.givenBy = by;
  await saveBooking(b, `Belöning given (tips: ${r.name})`, by);
}
