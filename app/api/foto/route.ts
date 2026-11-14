// Serves photos stored in the Upstash fallback (only used when Vercel Blob is not connected).
import { readFallbackPhoto } from "@/lib/booking/photos.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const p = await readFallbackPhoto(new URL(req.url).searchParams.get("k") || "").catch(() => null);
  if (!p) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(p.body), { headers: { "Content-Type": p.type, "Cache-Control": "private, max-age=86400", "X-Content-Type-Options": "nosniff" } });
}
