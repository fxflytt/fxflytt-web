// Admin: job sheets for the crew.
//   POST ?id=…[&renew=1]  → { url } link a worker can open without logging in (renew = the old link stops working)
//   GET  ?date=YYYY-MM-DD → { jobs } every booked job that day, for printing the whole day
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getBooking, saveBooking, listBookings, issueWorkToken, workView } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const q = new URL(req.url).searchParams;
  const b = await getBooking(q.get("id") || "");
  if (!b) return Response.json({ error: "not-found" }, { status: 404 });
  const renew = q.get("renew") === "1", had = !!b.workToken;
  const t = await issueWorkToken(b, renew);
  if (!had || renew) await saveBooking(b, renew ? "Ny länk till arbetsorder (den gamla slutade gälla)" : "Länk till arbetsorder skapad", u.name);
  return Response.json({ url: `${SITE}/arbetsorder?t=${t}` });
}

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const date = new URL(req.url).searchParams.get("date") || "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return Response.json({ error: "Ogiltigt datum." }, { status: 400 });
  const [all, res] = await Promise.all([listBookings(), listResources()]);
  const jobs = all.filter((b) => b.date === date && (b.status === "signed" || b.status === "done"))
    .sort((a, b) => (a.time || "99").localeCompare(b.time || "99")).map((b) => workView(b, res));
  return Response.json({ jobs });
}
