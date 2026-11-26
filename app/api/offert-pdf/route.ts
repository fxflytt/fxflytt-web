// The customer's offer as a PDF file (GET ?t=<offer token>) – "Ladda ner som PDF" in the offer and in the e-mail.
import { bookingByToken } from "@/lib/booking/store.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings, trustView } from "@/lib/booking/settings.ts";
import { offerPdf } from "@/lib/booking/offerpdf.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!kvConfigured()) return new Response("Inte tillgänglig", { status: 503 });
  if (await rateLimited("bpdf:" + clientIp(req), 20, 10 * 60_000)) return new Response("För många försök", { status: 429 });
  const b = await bookingByToken(new URL(req.url).searchParams.get("t") || "");
  if (!b || b.status === "cancelled" || b.status === "declined") return new Response("Offerten hittades inte", { status: 404 });
  const pdf = await offerPdf(b, await getSettings().then(trustView).catch(() => null));
  return new Response(new Uint8Array(pdf), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="FX-Flytt-offert-${b.id}.pdf"`,
    "Cache-Control": "no-store", "X-Robots-Tag": "noindex",
  } });
}
