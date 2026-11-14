// Public: the job sheet behind a crew link.
//   GET  ?t=…                      the sheet (no price, no customer e-mail)
//   POST ?t=…&do=start|finish      the crew started / finished the job
//   POST ?t=…&do=photo&kind=before|after|damage   body = the image (JPEG/PNG/WebP)
//   POST ?t=…&do=sign              {name, png (data URL), note} – the customer signs off on the phone
// The link stops working 7 days after the moving day, and nothing can be recorded on a cancelled job.
import { kvConfigured } from "@/lib/booking/kv.ts";
import { bookingByWorkToken, saveBooking, workView, type Booking } from "@/lib/booking/store.ts";
import { listResources } from "@/lib/booking/team.ts";
import { listPhotos, addPhoto, countPhotos, MAX_PHOTOS, PHOTO_KINDS, type PhotoKind } from "@/lib/booking/work.ts";
import { storePhoto, MAX_BYTES } from "@/lib/booking/photos.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (error: string, status: number) => Response.json({ error }, { status });

async function open(req: Request): Promise<Booking | Response> {
  if (rateLimited("order:" + clientIp(req), 120, 10 * 60_000)) return err("För många försök. Vänta en stund.", 429);
  if (!kvConfigured()) return err("Tjänsten är inte tillgänglig.", 503);
  const b = await bookingByWorkToken(new URL(req.url).searchParams.get("t") || "");
  if (!b) return err("Länken gäller inte.", 404);
  if (b.date && Date.parse(b.date + "T23:59:59Z") + 7 * 864e5 < Date.now()) return err("Länken har gått ut.", 410);
  return b;
}

const view = async (b: Booking) =>
  Response.json(workView(b, await listResources(), await listPhotos(b.id)), { headers: { "Cache-Control": "no-store" } });

export async function GET(req: Request) {
  const b = await open(req);
  return b instanceof Response ? b : view(b);
}

export async function POST(req: Request) {
  const b = await open(req);
  if (b instanceof Response) return b;
  if (b.status === "cancelled" || b.status === "declined") return err("Jobbet är avbokat.", 409);
  const q = new URL(req.url).searchParams, what = q.get("do");
  const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "okänd";
  b.work = b.work || {};

  if (what === "start") {
    if (!b.work.startedAt) { b.work.startedAt = Date.now(); await saveBooking(b, "Personalen startade jobbet"); }
    return view(b);
  }
  if (what === "finish") {
    if (!b.work.startedAt) return err("Tryck på Start först.", 400);
    if (!b.work.finishedAt) {
      b.work.finishedAt = Date.now();
      const done = b.status === "signed";
      if (done) b.status = "done";
      await saveBooking(b, "Personalen avslutade jobbet" + (done ? " – markerad som klar" : ""));
    }
    return view(b);
  }
  if (what === "photo") {
    const kind = q.get("kind") as PhotoKind;
    if (!(kind in PHOTO_KINDS)) return err("Okänd bildtyp.", 400);
    if (await countPhotos(b.id) >= MAX_PHOTOS) return err(`Max ${MAX_PHOTOS} bilder per jobb.`, 400);
    const buf = new Uint8Array(await req.arrayBuffer());
    if (!buf.length || buf.length > MAX_BYTES) return err("Bilden är för stor.", 413);
    try { await addPhoto(b.id, { url: await storePhoto("jobb/" + b.id, buf), kind, at: Date.now() }); }
    catch (e) { return err((e as Error).message, 400); }
    return view(b);
  }
  if (what === "sign") {
    if (b.work.sign) return err("Kunden har redan kvitterat.", 409);
    const d = (await req.json().catch(() => ({}))) as { name?: unknown; png?: unknown; note?: unknown };
    const name = typeof d.name === "string" ? d.name.trim().slice(0, 80) : "";
    const note = typeof d.note === "string" ? d.note.trim().slice(0, 1000) : "";
    const m = typeof d.png === "string" ? /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(d.png) : null;
    if (name.length < 2) return err("Skriv kundens namn.", 400);
    if (!m || m[1].length < 400) return err("Kunden behöver skriva sin signatur.", 400);
    let img: string;
    try { img = await storePhoto("signatur/" + b.id, new Uint8Array(Buffer.from(m[1], "base64"))); }
    catch (e) { return err((e as Error).message, 400); }
    const now = Date.now();
    b.work.sign = { name, at: now, img, note, ip };
    if (!b.work.startedAt) b.work.startedAt = now;
    if (!b.work.finishedAt) b.work.finishedAt = now;
    const done = b.status === "signed";
    if (done) b.status = "done";
    await saveBooking(b, `Kunden kvitterade utfört arbete: ${name}` + (note ? ` – anmärkning: ${note}` : "") + (done ? " – markerad som klar" : ""));
    return view(b);
  }
  return err("Okänd åtgärd.", 400);
}
