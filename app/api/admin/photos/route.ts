// Admin: the customer's photos of the home.
//   POST ?id= {ask: true}       → the customer's upload link (made if missing)
//   POST ?id= {analyze: true}   → the AI reads the photos again
//   DELETE ?id=&url=            → removes one photo from the booking
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking } from "@/lib/booking/store.ts";
import { photoLink } from "@/lib/booking/custphotos.ts";
import { analyzePhotos } from "@/lib/agents/photos.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return err("not-found", 404);
  const d = (await req.json().catch(() => ({}))) as { ask?: unknown; analyze?: unknown };
  if (d.ask === true) {
    const had = !!b.photoToken, url = await photoLink(b);
    if (!had) await saveBooking(b, "Länk för bilder skapad", u.name);
    return Response.json({ url, booking: b });
  }
  if (d.analyze === true) {
    if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY saknas i Vercel).", 503);
    if (!b.custPhotos?.length) return err("Inga bilder.");
    await analyzePhotos(b);
    return Response.json({ booking: b });
  }
  return err("Okänd åtgärd.");
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const q = new URL(req.url).searchParams, b = await getBooking(q.get("id") || "");
  if (!b) return err("not-found", 404);
  const url = q.get("url") || "", n = (b.custPhotos || []).length;
  b.custPhotos = (b.custPhotos || []).filter((p) => p.url !== url);
  if (b.custPhotos.length === n) return err("Hittar inte bilden.");
  await saveBooking(b, "En av kundens bilder borttagen", u.name);
  return Response.json({ booking: b });
}
