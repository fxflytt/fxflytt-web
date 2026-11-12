// POST /api/price – the price from FX Flytt AB's price list (v2), computed on the server.
// The booking step must always use this server result; any price sent by the browser is ignored.
import { computePrice, PriceError } from "@/lib/pricing/pricelist.js";
import P from "@/lib/pricing/prices.json";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
const ALLOWED = new Set(["service", "areaM2", "distanceKm", "pkg", "crew", "hours", "boxes", "volumeM3"]);

export async function POST(req: Request) {
  if (rateLimited("price:" + clientIp(req), 60, 60_000)) return Response.json({ error: "För många förfrågningar." }, { status: 429 });
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });
  const input = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED.has(k)));
  try {
    return Response.json({ price: computePrice(input as never, P) });
  } catch (e) {
    if (e instanceof PriceError) return Response.json({ error: e.message, field: e.field }, { status: 400 });
    console.error("price failed", e);
    return Response.json({ error: "Något gick fel" }, { status: 500 });
  }
}

export async function GET() {
  return Response.json(P);
}
