// Crew app: the logged-in person's jobs (booked or done, 14 days back to 90 days ahead).
// Each job links to its job sheet inside the app (/jobb/order?t=…). No prices, no customer e-mail.
import { crewUser } from "@/lib/booking/crew.ts";
import { listBookings, issueWorkToken, saveBooking } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { schedule } from "@/lib/booking/schedule.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const day = (n: number) => { const d = new Date(Date.now() + n * 864e5); return d.toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" }); };
const town = (a?: string) => (a || "").split(",").pop()!.replace(/\d/g, "").trim();

export async function GET(req: Request) {
  const me = await crewUser(req);
  if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const [all, res] = await Promise.all([listBookings(), listResources()]);
  const byId = new Map(res.map((r) => [r.id, r])), from = day(-14), to = day(90);
  const mine = all.filter((b) => (b.crew || []).includes(me.id) && b.date && b.date >= from && b.date <= to && ["signed", "done", "cancelled"].includes(b.status));
  const jobs = [];
  for (const b of mine) {
    if (!b.workToken && b.status !== "cancelled") { await issueWorkToken(b); await saveBooking(b, "Länk till arbetsorder skapad (personalappen)"); }
    const s = schedule.span(b);
    jobs.push({
      id: b.id, date: b.date, time: b.time || "", end: s && !s.allDay ? schedule.fmtMin(s.end) : "", hours: schedule.hoursOf(b), status: b.status,
      customer: b.data.name, from: town(b.data.from) || b.data.from || "", to: town(b.data.to) || b.data.to || "", size: b.data.size || "", areaM2: b.data.areaM2 || "",
      started: !!b.work?.startedAt, finished: !!b.work?.finishedAt, note: !!b.crewNote,
      mates: (b.crew || []).filter((id) => id !== me.id).map((id) => byId.get(id)).filter(Boolean).map((r) => ({ name: r!.name, vehicle: r!.kind === "vehicle" })),
      url: b.status === "cancelled" || !b.workToken ? "" : "/jobb/order?t=" + b.workToken,
    });
  }
  jobs.sort((a, b) => (a.date + (a.time || "99")).localeCompare(b.date + (b.time || "99")));
  return Response.json({ me: { name: me.name, role: me.role || "" }, today: day(0), jobs }, { headers: { "Cache-Control": "no-store" } });
}
