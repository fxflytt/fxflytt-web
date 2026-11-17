// Two requests from the same customer (same phone or e-mail) are merged into one: the booking that is
// kept gets every detail the other one has and it lacks, both histories and call logs, and the earliest
// "came in" time (so the response time stays honest). The other booking is then removed.
import type { Booking } from "./store.ts";

const OPEN = ["new", "sent", "declined"];
export const digits = (p?: string) => String(p || "").replace(/\D/g, "").replace(/^46/, "0");
export const sameCustomer = (a: Booking, b: Booking) =>
  (digits(a.data.phone).length >= 6 && digits(a.data.phone) === digits(b.data.phone)) ||
  (!!a.data.email && a.data.email.toLowerCase() === (b.data.email || "").toLowerCase());
export const canMerge = (b: Booking) => OPEN.includes(b.status) && !b.signedAt;

export function mergeInto(keep: Booking, other: Booking): Booking {
  if (keep.id === other.id) throw new Error("Samma bokning.");
  if (!canMerge(other)) throw new Error("Den andra bokningen är redan signerad – den kan inte slås ihop.");
  const d = keep.data as Record<string, unknown>, o = other.data as Record<string, unknown>;
  for (const [k, v] of Object.entries(o)) {
    if (k === "message") continue;
    const empty = d[k] === undefined || d[k] === "" || (Array.isArray(d[k]) && !(d[k] as unknown[]).length);
    if (empty && v !== undefined && v !== "") d[k] = v;
  }
  const msgs = [keep.data.message, other.data.message].filter(Boolean);
  if (msgs.length > 1 && msgs[0] !== msgs[1]) keep.data.message = msgs.join("\n— Från den andra förfrågan —\n").slice(0, 3000);
  else if (!keep.data.message && other.data.message) keep.data.message = other.data.message;
  if (!keep.offer && other.offer) { keep.offer = other.offer; keep.packages = other.packages; }
  if (!keep.date && other.date) keep.date = other.date;
  if (!keep.time && other.time) keep.time = other.time;
  if (!keep.followUp && other.followUp) keep.followUp = other.followUp;
  if (!keep.lead && other.lead) keep.lead = other.lead;
  if (!keep.referral && other.referral) keep.referral = other.referral;
  keep.calls = [...(other.calls || []), ...(keep.calls || [])].sort((a, b) => a.at - b.at).slice(-50);
  keep.history = [...other.history.map((h) => ({ ...h, what: `[${other.id}] ${h.what}` })), ...keep.history].sort((a, b) => a.at - b.at).slice(-55);
  keep.createdAt = Math.min(keep.createdAt, other.createdAt);
  const fr = [keep.firstResponseAt, other.firstResponseAt].filter((x): x is number => !!x);
  if (fr.length) keep.firstResponseAt = Math.min(...fr);
  const ct = [keep.contactedAt, other.contactedAt].filter((x): x is number => !!x);
  if (ct.length) keep.contactedAt = Math.min(...ct);
  if (other.views) { keep.views = (keep.views || 0) + other.views; keep.lastViewAt = Math.max(keep.lastViewAt || 0, other.lastViewAt || 0) || undefined; }
  return keep;
}
