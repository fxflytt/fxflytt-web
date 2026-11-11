// POST /api/quote – computes a price estimate ON THE SERVER with the active pricing config.
// The browser never decides the price; it only sends what the customer entered.
import { computeQuote, ValidationError } from "@/lib/pricing/engine.ts";
import { currentConfig, catalog } from "@/lib/pricing/config.current.ts";
import type { QuoteInput } from "@/lib/pricing/types.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";

const ALLOWED_KEYS = new Set([
  "kind", "propertyType", "size", "date", "pickup", "delivery", "drivingDistanceKm",
  "inventory", "knownVolumeM3", "extras", "cleaningM2", "wantsRut", "flex",
]);

export async function POST(req: Request) {
  if (rateLimited("quote:" + clientIp(req), 60, 60_000)) {
    return Response.json({ error: "För många förfrågningar. Försök igen om en stund." }, { status: 429 });
  }
  let body: unknown;
  try { body = await req.json(); } catch { return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 }); }
  if (!body || typeof body !== "object" || Array.isArray(body)) return Response.json({ error: "Ogiltig förfrågan" }, { status: 400 });

  // Only known fields are used; anything else (e.g. a "price" sent by the browser) is dropped.
  const input = Object.fromEntries(Object.entries(body).filter(([k]) => ALLOWED_KEYS.has(k))) as unknown as QuoteInput;
  try {
    const quote = computeQuote(input, currentConfig, catalog);
    return Response.json({ quote });
  } catch (e) {
    if (e instanceof ValidationError) return Response.json({ error: e.message, field: e.field }, { status: 400 });
    console.error("quote failed", e);
    return Response.json({ error: "Något gick fel" }, { status: 500 });
  }
}

export async function GET() {
  // Public: the item catalogue (for the volume calculator) and the config version. No secrets.
  return Response.json({ configVersion: currentConfig.version, catalog });
}
