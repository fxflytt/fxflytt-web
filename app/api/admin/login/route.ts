// Admin login (POST {username?, password}), logout (DELETE) and status (GET).
// Without a username the password is the owner password (ADMIN_PASSWORD in Vercel).
import { adminConfigured, passwordOk, sessionCookie, clearCookie, currentUser } from "@/lib/booking/auth.ts";
import { verifyLogin } from "@/lib/booking/users.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { mailConfigured } from "@/lib/mail/send.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await currentUser(req);
  return Response.json({ admin: !!user, user, setup: { password: adminConfigured(), storage: kvConfigured(), mail: mailConfigured() } });
}

export async function POST(req: Request) {
  if (rateLimited("login:" + clientIp(req), 8, 15 * 60_000)) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  if (!adminConfigured()) return Response.json({ error: "Lösenord saknas i Vercel (ADMIN_PASSWORD)." }, { status: 503 });
  const body = (await req.json().catch(() => ({}))) as { username?: unknown; password?: unknown };
  let cookie = "";
  if (typeof body.username === "string" && body.username.trim()) {
    if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
    const u = await verifyLogin(body.username, body.password);
    if (u) cookie = sessionCookie(u.id, u.sv);
  } else if (passwordOk(body.password)) cookie = sessionCookie("owner", 0);
  if (!cookie) return Response.json({ error: "Fel användarnamn eller lösenord." }, { status: 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": cookie } });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie() } });
}
