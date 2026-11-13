// Admin: list (GET), one booking (GET ?id=), create (POST), update (PATCH ?id=).
import { isAdmin, unauthorized } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listBookings, getBooking, saveBooking, createBooking, STATUSES, type Status } from "@/lib/booking/store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const DATE = /^\d{4}-\d{2}-\d{2}$/, TIME = /^(0[7-9]|1[0-7]):(00|30)$|^18:00$/; // starttid 07:00–18:00, halvtimmar
const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  const id = new URL(req.url).searchParams.get("id");
  if (id) {
    const b = await getBooking(id);
    return b ? Response.json(b) : Response.json({ error: "not-found" }, { status: 404 });
  }
  return Response.json({ bookings: await listBookings() });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = str(d.name, 120), phone = str(d.phone, 40);
  if (!name || !phone) return Response.json({ error: "Namn och telefon behövs." }, { status: 400 });
  const total = Number(d.total);
  const date = str(d.date, 10);
  const b = await createBooking("admin", {
    name, phone, email: str(d.email, 200), from: str(d.from, 200), to: str(d.to, 200),
    size: str(d.size, 80), areaM2: str(d.areaM2, 10), date: DATE.test(date) ? date : "", message: str(d.message, 3000),
  }, {
    offer: isFinite(total) && total > 0 ? { total: Math.round(total), lines: [], custom: true, customerNote: str(d.customerNote, 500) } : undefined,
    time: TIME.test(str(d.time, 5)) ? str(d.time, 5) : undefined,
  });
  return Response.json(b);
}

export async function PATCH(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const changes: string[] = [];

  if ("date" in d) { const v = str(d.date, 10); b.date = DATE.test(v) ? v : undefined; changes.push("datum"); }
  if ("time" in d) { const v = str(d.time, 5); b.time = TIME.test(v) ? v : undefined; changes.push("tid"); }
  if ("adminNote" in d) { b.adminNote = str(d.adminNote, 2000); changes.push("intern anteckning"); }
  if ("total" in d) {
    const t = Math.round(Number(d.total));
    if (!(t > 0 && t < 1e7)) return Response.json({ error: "Ogiltigt pris." }, { status: 400 });
    if (!b.offer || b.offer.total !== t) {
      b.offer = { ...(b.offer || { lines: [] }), total: t, custom: true };
      changes.push("pris " + t + " kr");
    }
  }
  if ("customerNote" in d) { b.offer = { ...(b.offer || { total: 0, lines: [] }), customerNote: str(d.customerNote, 500) }; changes.push("text till kunden"); }
  if ("status" in d) {
    const s = d.status as Status;
    if (!STATUSES.includes(s)) return Response.json({ error: "Ogiltig status." }, { status: 400 });
    if (s !== b.status) { changes.push("status " + s); b.status = s; }
  }
  // A signed offer is a contract – changing price or date afterwards must be visible.
  if (b.signedAt && changes.some((c) => c.startsWith("pris") || c === "datum")) changes.push("(efter signering)");
  await saveBooking(b, changes.length ? "Ändrat: " + changes.join(", ") : undefined);
  return Response.json(b);
}
