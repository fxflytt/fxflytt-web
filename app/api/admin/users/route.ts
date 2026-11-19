// Owner only: staff accounts. List (GET), create (POST), change / deactivate / new password (PATCH ?id=).
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listUsers, createUser, updateUser, publicUser } from "@/lib/booking/users.ts";
import { getOwner, updateOwner } from "@/lib/booking/owner.ts";
import { sessionCookie } from "@/lib/booking/auth.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const o = await getOwner();
  return Response.json({ users: (await listUsers()).map(publicUser), owner: { emails: o.emails, ownPassword: !!o.hash } });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  // ?do=owner {emails?, password?, current?} – the owner's own login (e-mail addresses, password).
  if (new URL(req.url).searchParams.get("do") === "owner") {
    if (u.id !== "owner") return Response.json({ error: "Bara ägarkontot kan ändra ägarens inloggning." }, { status: 403 });
    try {
      const r = await updateOwner((await req.json().catch(() => ({}))) as Record<string, unknown>);
      // A new password logs out other devices; this one gets a fresh cookie so it stays logged in.
      return new Response(JSON.stringify({ emails: r.emails, ownPassword: r.ownPassword }), { headers: { "Content-Type": "application/json", "Set-Cookie": sessionCookie("owner", r.sv) } });
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  }
  try { return Response.json(await createUser((await req.json().catch(() => ({}))) as Record<string, unknown>)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const id = new URL(req.url).searchParams.get("id") || "";
  if (id === u.id) return Response.json({ error: "Du kan inte ändra ditt eget konto här." }, { status: 400 });
  try {
    const r = await updateUser(id, (await req.json().catch(() => ({}))) as Record<string, unknown>);
    return r ? Response.json(r) : Response.json({ error: "not-found" }, { status: 404 });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}
