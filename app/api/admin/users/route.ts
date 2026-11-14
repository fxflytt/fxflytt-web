// Owner only: staff accounts. List (GET), create (POST), change / deactivate / new password (PATCH ?id=).
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listUsers, createUser, updateUser, publicUser } from "@/lib/booking/users.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  return Response.json({ users: (await listUsers()).map(publicUser) });
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
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
