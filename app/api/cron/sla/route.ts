// GET /api/cron/sla – checks for unanswered requests (see lib/booking/sla.ts). Safe to call often.
import { slaCheck } from "@/lib/booking/sla.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!kvConfigured()) return Response.json({ ok: false });
  const secret = process.env.CRON_SECRET;
  const authed = !!secret && req.headers.get("authorization") === `Bearer ${secret}`;
  return Response.json({ ok: true, warned: await slaCheck(authed).catch(() => 0) });
}
