// Photo storage for job photos and customer signatures.
//   Vercel Blob when BLOB_READ_WRITE_TOKEN is set (Vercel → Storage → Blob → connect to the project).
//   Otherwise a small fallback in Upstash (fx:ph:<key>, kept 400 days) so the feature still works.
// Files get random names; the links are only shown in the admin page and on the crew's job sheet.
import { randomBytes } from "node:crypto";
import { put } from "@vercel/blob";
import { kv } from "./kv.ts";

export const blobConfigured = () => Boolean(process.env.BLOB_READ_WRITE_TOKEN);
export const MAX_BYTES = 3_000_000;
const FALLBACK_MAX = 400_000, TTL = 400 * 86400;

const TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };

// Checks the first bytes so only real images are stored.
export function sniff(buf: Uint8Array): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45) return "image/webp";
  return null;
}

export async function storePhoto(folder: string, buf: Uint8Array): Promise<string> {
  const type = sniff(buf);
  if (!type) throw new Error("Bara bilder (JPEG, PNG, WebP).");
  if (buf.length > MAX_BYTES) throw new Error("Bilden är för stor.");
  const name = `${folder}/${Date.now()}-${randomBytes(8).toString("hex")}.${TYPES[type]}`;
  if (blobConfigured()) {
    const r = await put("fx/" + name, Buffer.from(buf), { access: "public", contentType: type, addRandomSuffix: true });
    return r.url;
  }
  if (buf.length > FALLBACK_MAX) throw new Error("Bilden är för stor.");
  const key = randomBytes(12).toString("base64url");
  await kv(["SET", "fx:ph:" + key, type + ";" + Buffer.from(buf).toString("base64"), "EX", TTL]);
  return "/api/foto?k=" + key;
}

export async function readFallbackPhoto(key: string): Promise<{ type: string; body: Buffer } | null> {
  if (!/^[A-Za-z0-9_-]{16}$/.test(key)) return null;
  const s = await kv<string | null>(["GET", "fx:ph:" + key]);
  if (!s) return null;
  const i = s.indexOf(";");
  return { type: s.slice(0, i), body: Buffer.from(s.slice(i + 1), "base64") };
}
