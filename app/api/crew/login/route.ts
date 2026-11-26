// Crew app login: GET who is logged in, POST {phone, pin}, DELETE logs out.
import { crewUser, login, crewCookie, clearCrewCookie } from "@/lib/booking/crew.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { rateLimited, clientIp } from "@/lib/rateLimit.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!kvConfigured()) return Response.json({ person: null });
  const r = await crewUser(req);
  return Response.json({ person: r ? { name: r.name, role: r.role || "" } : null });
}

export async function POST(req: Request) {
  if (await rateLimited("crewlogin:" + clientIp(req), 20, 15 * 60_000)) return Response.json({ error: "För många försök. Vänta en stund." }, { status: 429 });
  if (!kvConfigured() || !process.env.ADMIN_PASSWORD) return Response.json({ error: "Appen är inte igång. Ring kontoret." }, { status: 503 });
  const d = (await req.json().catch(() => ({}))) as { phone?: unknown; pin?: unknown };
  const r = await login(d.phone, d.pin);
  if ("error" in r) return Response.json({ error: r.error }, { status: 401 });
  return new Response(JSON.stringify({ ok: true, person: { name: r.person.name } }), { headers: { "Content-Type": "application/json", "Set-Cookie": crewCookie(r.person) } });
}

export async function DELETE() {
  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json", "Set-Cookie": clearCrewCookie() } });
}
