// Public: the job sheet behind a crew link (GET ?t=…). Read-only, no price or customer e-mail.
// The link stops working 7 days after the moving day.
import { kvConfigured } from "@/lib/booking/kv.ts";
import { bookingByWorkToken, workView } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (rateLimited("order:" + clientIp(req), 60, 10 * 60_000)) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  if (!kvConfigured()) return Response.json({ error: "Tjänsten är inte tillgänglig." }, { status: 503 });
  const b = await bookingByWorkToken(new URL(req.url).searchParams.get("t") || "");
  if (!b) return Response.json({ error: "Länken gäller inte." }, { status: 404 });
  if (b.date && Date.parse(b.date + "T23:59:59Z") + 7 * 864e5 < Date.now()) return Response.json({ error: "Länken har gått ut." }, { status: 410 });
  return Response.json(workView(b, await listResources()), { headers: { "Cache-Control": "no-store" } });
}
