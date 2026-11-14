// Owner only: the price list.
//   GET   { current, default, log: earlier versions (newest first) }
//   PUT   body = new price list → saved, returns it (offers already sent keep their price)
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getPrices, validatePrices, savePrices, priceLog, DEFAULT_PRICES } from "@/lib/pricing/current.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  return Response.json({ current: await getPrices(), default: DEFAULT_PRICES, log: await priceLog() });
}

export async function PUT(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  try {
    const p = validatePrices((await req.json().catch(() => ({}))) as Record<string, unknown>, await getPrices());
    return Response.json(await savePrices(p, u.name));
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
