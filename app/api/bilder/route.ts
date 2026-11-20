// "Skicka bilder" – the customer's own link (/bilder?t=…).
//   GET  ?t=               → { name, count, max }   (first name only)
//   POST ?t=  (image body) → stores one photo
//   POST ?t=&done=1        → the customer is done: the office gets a notice and the AI reads the photos
import { after } from "next/server";
import { bookingByPhotoToken, addCustPhoto, MAX_CUST_PHOTOS } from "@/lib/booking/custphotos.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";
import { saveBooking, getBooking } from "@/lib/booking/store.ts";
import { notifyAll } from "@/lib/booking/push.ts";
import { analyzePhotos } from "@/lib/agents/photos.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function GET(req: Request) {
  if (!kvConfigured()) return err("unavailable", 503);
  const b = await bookingByPhotoToken(new URL(req.url).searchParams.get("t") || "");
  if (!b) return err("Länken fungerar inte längre. Ring oss på 076-300 07 23.", 404);
  return Response.json({ name: (b.data.name || "").split(" ")[0], count: (b.custPhotos || []).length, max: MAX_CUST_PHOTOS }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  if (!kvConfigured()) return err("unavailable", 503);
  if (rateLimited("bilder:" + clientIp(req), 40, 10 * 60_000)) return err("För många bilder på en gång. Vänta en stund.", 429);
  const q = new URL(req.url).searchParams;
  const b = await bookingByPhotoToken(q.get("t") || "");
  if (!b) return err("Länken fungerar inte längre. Ring oss på 076-300 07 23.", 404);
  if (q.get("done")) {
    const n = (b.custPhotos || []).length;
    if (!n) return err("Inga bilder än.");
    await saveBooking(b, `Kunden skickade bilder (${n} st)`);
    await notifyAll({ cat: "new", title: `📷 ${b.data.name} skickade ${n} bilder`, body: "Bilder på hemmet – AI:n uppskattar volymen", url: "/admin#" + b.id, tag: "photos-" + b.id });
    after(async () => { const fresh = await getBooking(b.id); if (fresh) await analyzePhotos(fresh).catch(() => {}); });
    return Response.json({ ok: true, count: n });
  }
  const buf = new Uint8Array(await req.arrayBuffer());
  if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.", 413);
  try { await addCustPhoto(b, await storePhoto("kund/" + b.id, buf)); }
  catch (e) { return err((e as Error).message); }
  return Response.json({ ok: true, count: (b.custPhotos || []).length });
}
