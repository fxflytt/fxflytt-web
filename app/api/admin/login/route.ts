// Admin login (POST {username, password}), logout (DELETE) and status (GET).
// The owner logs in with one of the owner's e-mail addresses (see lib/booking/owner.ts) + the owner password;
// staff with their username + password.
import { adminConfigured, sessionCookie, clearCookie, currentUser } from "@/lib/booking/auth.ts";
import { verifyLogin } from "@/lib/booking/users.ts";
import { ownerLogin } from "@/lib/booking/owner.ts";
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
  const name = typeof body.username === "string" ? body.username.trim() : "";
  if (!name) return Response.json({ error: "Skriv din e-post (eller ditt användarnamn)." }, { status: 400 });
  if (name.includes("@")) {
    const sv = await ownerLogin(name, body.password);
    if (sv !== null) cookie = sessionCookie("owner", sv);
  } else {
    if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
    const u = await verifyLogin(name, body.password);
    if (u) cookie = sessionCookie(u.id, u.sv);
  }
  if (!cookie) return Response.json({ error: "Fel e-post/användarnamn eller lösenord." }, { status: 401 });
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": cookie } });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearCookie() } });
}
