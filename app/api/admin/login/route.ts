// Admin login (POST {password}), logout (DELETE) and status (GET).
import { adminConfigured, passwordOk, sessionCookie, clearCookie, isAdmin } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { mailConfigured } from "@/lib/mail/send.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";

export async function GET(req: Request) {
  return Response.json({ admin: isAdmin(req), setup: { password: adminConfigured(), storage: kvConfigured(), mail: mailConfigured() } });
}

export async function POST(req: Request) {
  if (rateLimited("login:" + clientIp(req), 8, 15 * 60_000)) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  if (!adminConfigured()) return Response.json({ error: "Lösenord saknas i Vercel (ADMIN_PASSWORD)." }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  if (!passwordOk((body as { password?: unknown }).password)) return Response.json({ error: "Fel lösenord." }, { status: 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie() } });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie() } });
}
