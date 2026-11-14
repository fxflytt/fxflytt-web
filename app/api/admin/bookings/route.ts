// Admin: list (GET), one booking (GET ?id=), create (POST), update (PATCH ?id=).
import { isAdmin, unauthorized } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listBookings, getBooking, saveBooking, createBooking, STATUSES, type Status } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { schedule } from "@/lib/booking/schedule.ts";

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
    distanceKm: typeof d.distanceKm === "number" && d.distanceKm >= 0 && d.distanceKm < 5000 ? Math.round(d.distanceKm) : undefined,
    floorFrom: str(d.floorFrom, 140), floorTo: str(d.floorTo, 140),
  }, {
    offer: isFinite(total) && total > 0 ? offerFrom(Math.round(total), d) : undefined,
    time: TIME.test(str(d.time, 5)) ? str(d.time, 5) : undefined,
  });
  return Response.json(b);
}

// Lines from the admin price calculator are kept only when they add up to the total; otherwise the
// price is a hand-set ("custom") price and the customer sees just the total.
function offerFrom(total: number, d: Record<string, unknown>) {
  const raw = Array.isArray(d.lines) ? d.lines.slice(0, 12) : [];
  const lines = raw.map((l) => ({ label: str((l as { label?: unknown })?.label, 120), amount: Math.round(Number((l as { amount?: unknown })?.amount)) }))
    .filter((l) => l.label && isFinite(l.amount) && Math.abs(l.amount) < 1e7);
  const ok = lines.length > 0 && lines.length === raw.length && lines.reduce((a, l) => a + l.amount, 0) === total;
  return { total, lines: ok ? lines : [], custom: !ok, customerNote: str(d.customerNote, 500), note: ok ? str(d.note, 200) || undefined : undefined };
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
  if ("durationH" in d) {
    const h = Number(d.durationH), was = b.durationH;
    if (d.durationH === null || d.durationH === "") b.durationH = undefined;
    else if (h >= 0.5 && h <= 14 && Math.round(h * 2) === h * 2) b.durationH = h;
    else return Response.json({ error: "Tid ska vara 0,5–14 timmar (halvtimmar)." }, { status: 400 });
    if (b.durationH !== was) changes.push("beräknad tid " + (b.durationH ? String(b.durationH).replace(".", ",") + " tim" : "auto"));
  }
  let resources: Awaited<ReturnType<typeof listResources>> | null = null;
  if ("crew" in d) {
    resources = await listResources();
    const ids = Array.isArray(d.crew) ? [...new Set(d.crew.filter((x): x is string => typeof x === "string"))].slice(0, 12) : [];
    const before = new Set(b.crew || []);
    const byId = new Map(resources.map((r) => [r.id, r]));
    // New picks must be active; someone already on the job stays even if archived since.
    const bad = ids.find((id) => !byId.get(id) || (!byId.get(id)!.active && !before.has(id)));
    if (bad) return Response.json({ error: "Okänd eller arkiverad person/fordon." }, { status: 400 });
    const same = ids.length === before.size && ids.every((id) => before.has(id));
    if (!same) { b.crew = ids; changes.push(ids.length ? "personal " + ids.map((id) => byId.get(id)!.name).join(", ") : "personal borttagen"); }
  }
  if ("adminNote" in d) { b.adminNote = str(d.adminNote, 2000); changes.push("intern anteckning"); }
  if ("crewNote" in d) { const v = str(d.crewNote, 1000); if (v !== (b.crewNote || "")) { b.crewNote = v; changes.push("anteckning till personalen"); } }
  if ("total" in d) {
    const t = Math.round(Number(d.total));
    if (!(t > 0 && t < 1e7)) return Response.json({ error: "Ogiltigt pris." }, { status: 400 });
    if (!b.offer || b.offer.total !== t) {
      b.offer = { ...(b.offer || { lines: [] }), total: t, custom: true };
      b.discount = undefined; // a hand-set price replaces any earlier discount
      changes.push("pris " + t + " kr");
    }
  }
  if ("customerNote" in d) { b.offer = { ...(b.offer || { total: 0, lines: [] }), customerNote: str(d.customerNote, 500) }; changes.push("text till kunden"); }
  if ("extras" in d) {
    if (b.signedAt) return Response.json({ error: "Tillval går inte att ändra efter signering." }, { status: 400 });
    const list = Array.isArray(d.extras) ? d.extras.slice(0, 8) : [];
    const ex = [];
    for (const [i, e] of list.entries()) {
      const label = str((e as { label?: unknown })?.label, 80), price = Math.round(Number((e as { price?: unknown })?.price));
      if (!label || !(price > 0 && price < 1e6)) return Response.json({ error: "Varje tillval behöver namn och pris." }, { status: 400 });
      ex.push({ id: "e" + (i + 1), label, price });
    }
    b.extras = ex; changes.push(ex.length ? "tillval " + ex.map((e) => `${e.label} ${e.price} kr`).join(", ") : "tillval borttagna");
  }
  if ("status" in d) {
    const s = d.status as Status;
    if (!STATUSES.includes(s)) return Response.json({ error: "Ogiltig status." }, { status: 400 });
    if (s !== b.status) { changes.push("status " + s); b.status = s; }
  }
  // A signed offer is a contract – changing price or date afterwards must be visible.
  if (b.signedAt && changes.some((c) => c.startsWith("pris") || c === "datum")) changes.push("(efter signering)");
  await saveBooking(b, changes.length ? "Ändrat: " + changes.join(", ") : undefined);
  // Warn (never block) when someone on this job is already on another job at the same time.
  const planChanged = ["date", "time", "durationH", "crew", "status"].some((k) => k in d);
  const conflicts = planChanged && b.crew?.length ? schedule.conflicts(b, await listBookings(), resources || await listResources()) : [];
  return Response.json({ ...b, conflicts });
}
