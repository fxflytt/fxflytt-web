// "Skicka bilder": the customer sends photos of the home with the request, from a personal link
// (/bilder?t=…). The link is made when a request comes in from the website, or by the office ("Be om bilder").
//   fx:pt:<token> → booking id
// The photos are stored like the job photos (Vercel Blob, else Upstash) and listed on the booking.
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";
import { getBooking, saveBooking, type Booking } from "./store.ts";

export const MAX_CUST_PHOTOS = 15;
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";

export async function photoLink(b: Booking): Promise<string> {
  if (!b.photoToken) {
    b.photoToken = randomBytes(18).toString("base64url");
    await kv(["SET", "fx:pt:" + b.photoToken, b.id]);
  }
  return `${SITE}/bilder?t=${b.photoToken}`;
}

export async function bookingByPhotoToken(t: string): Promise<Booking | null> {
  if (!/^[A-Za-z0-9_-]{24}$/.test(t)) return null;
  const id = await kv<string | null>(["GET", "fx:pt:" + t]);
  const b = id ? await getBooking(id) : null;
  return b && b.photoToken === t && !["cancelled"].includes(b.status) ? b : null;
}

export async function addCustPhoto(b: Booking, url: string) {
  const list = b.custPhotos || [];
  if (list.length >= MAX_CUST_PHOTOS) throw new Error(`Högst ${MAX_CUST_PHOTOS} bilder.`);
  b.custPhotos = [...list, { url, at: Date.now() }];
  await saveBooking(b);
}
