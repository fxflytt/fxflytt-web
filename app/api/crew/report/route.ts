// Crew app: report fuel and damage.
//   GET   → { vehicles, jobs (mine, last 14 days + today), suggest (vehicle on my job today), fuel, damages (mine, recent) }
//   POST {type:"fuel", vid, kr, liters, km, note}
//   POST {type:"damage", kind:"customer"|"vehicle", bookingId?, vid?, desc}
//   POST ?photo=1&fuel=<id> | ?photo=1&damage=<id>   (image body) – only on my own report, the same day
import { crewUser } from "@/lib/booking/crew.ts";
import { listResources } from "@/lib/booking/team.ts";
import { bookingsBetween, getBooking, saveBooking } from "@/lib/booking/store.ts";
import { getFleet, addLog, setLogPhoto } from "@/lib/booking/fleet.ts";
import { listDamages, addDamage, addDamagePhoto } from "@/lib/booking/damage.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";
import { notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const day = (n = 0) => new Date(Date.now() + n * 864e5).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

async function myJobs(rid: string) {
  const from = day(-14), to = day(0);
  return (await bookingsBetween(from, to)).filter((b) => (b.crew || []).includes(rid) && b.date && b.date >= from && b.date <= to && ["signed", "done"].includes(b.status))
    .sort((a, b) => (b.date! + (b.time || "")).localeCompare(a.date! + (a.time || "")));
}

export async function GET(req: Request) {
  const me = await crewUser(req); if (!me) return err("unauthorized", 401);
  const [res, jobs, f, dmg] = await Promise.all([listResources(), myJobs(me.id), getFleet(), listDamages()]);
  const vehicles = res.filter((r) => r.kind === "vehicle" && r.active);
  const t = day(0), todays = jobs.filter((b) => b.date === t);
  const suggest = todays.flatMap((b) => b.crew || []).find((id) => vehicles.some((v) => v.id === id)) || (vehicles.length === 1 ? vehicles[0].id : "");
  const since = Date.now() - 30 * 864e5;
  return Response.json({
    vehicles: vehicles.map((v) => ({ id: v.id, name: v.name, km: f.v[v.id]?.km ?? null })), suggest,
    jobs: jobs.map((b) => ({ id: b.id, date: b.date, time: b.time || "", customer: b.data.name })),
    fuel: f.log.filter((e) => e.byCrew === me.id && e.at >= since).reverse().slice(0, 10).map((e) => ({ id: e.id, vid: e.vid, date: e.date, kr: e.kr, liters: e.liters, km: e.km, photo: !!e.photo })),
    damages: dmg.filter((d) => d.byCrew === me.id && d.createdAt >= since).reverse().map((d) => ({ id: d.id, kind: d.kind, date: d.date, title: d.title, customer: d.customer, vehicle: d.vehicle, status: d.status, photos: d.photos.length })),
  }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return err("unauthorized", 401);
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("photo")) {
      const buf = new Uint8Array(await req.arrayBuffer());
      if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.", 413);
      if (q.get("fuel")) { await setLogPhoto(q.get("fuel")!, await storePhoto("fordon", buf), me.id); return Response.json({ ok: true }); }
      const x = await addDamagePhoto(q.get("damage") || "", await storePhoto("skador", buf), me.name, me.id);
      return Response.json({ ok: true, photos: x.photos.length });
    }
    const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const vehicles = (await listResources()).filter((r) => r.kind === "vehicle" && r.active);
    const v = vehicles.find((r) => r.id === d.vid);
    if (d.type === "fuel") {
      if (!v) return err("Välj fordon.");
      const e = await addLog(v.id, { kind: "fuel", kr: d.kr, liters: d.liters, km: d.km, note: d.note }, me.name, me.id);
      return Response.json({ ok: true, id: e.id });
    }
    if (d.type === "damage") {
      let booking;
      if (d.kind === "customer") {
        const b = (await myJobs(me.id)).find((x) => x.id === d.bookingId);
        if (!b) return err("Välj vilket jobb det gäller.");
        booking = { id: b.id, name: b.data.name };
      }
      const x = await addDamage({ kind: d.kind, desc: d.desc }, me.name, { booking, vehicle: v ? { id: v.id, name: v.name } : undefined, crewId: me.id });
      if (booking) { const b = await getBooking(booking.id); if (b) await saveBooking(b, `Skada rapporterad av ${me.name}: ${x.title}`); }
      await notifyAll({ cat: "crew", title: `⚠️ Skada rapporterad – ${x.kind === "vehicle" ? x.vehicle : x.customer}`, body: `${me.name}: ${x.desc.slice(0, 120)}`, url: "/admin#skador", tag: "dmg-" + x.id });
      return Response.json({ ok: true, id: x.id });
    }
    return err("Okänd typ.");
  } catch (e) { return err((e as Error).message); }
}
