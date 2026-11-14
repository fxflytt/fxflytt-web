// Owner only.
//   GET ?type=hours&month=YYYY-MM[&format=csv]   hours per person (CSV opens in Excel)
//   GET ?type=money                              money per month, upcoming, open offers
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listBookings } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { hoursReport, hoursCsv, moneyReport } from "@/lib/booking/report.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  const q = new URL(req.url).searchParams;
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  if (q.get("type") === "money") return Response.json(moneyReport(await listBookings(2000), today));
  const month = q.get("month") || today.slice(0, 7);
  if (!/^\d{4}-\d{2}$/.test(month)) return Response.json({ error: "Ogiltig månad." }, { status: 400 });
  const rows = hoursReport(await listBookings(2000), await listResources(), month);
  if (q.get("format") === "csv") return new Response(hoursCsv(rows, month), { headers: {
    "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="timrapport-${month}.csv"` } });
  return Response.json({ month, rows });
}
