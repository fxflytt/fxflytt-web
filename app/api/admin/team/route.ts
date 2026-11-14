// Admin: staff and vehicles. List (GET), add (POST), change or archive (PATCH ?id=).
import { isAdmin, unauthorized } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listResources, addResource, updateResource, cleanResource } from "@/lib/booking/team.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function GET(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  return Response.json({ resources: await listResources() });
}

export async function POST(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  const c = cleanResource((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in c) return Response.json({ error: c.error }, { status: 400 });
  try { return Response.json(await addResource(c.ok)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  if (!isAdmin(req)) return unauthorized();
  if (!kvConfigured()) return noStorage();
  const c = cleanResource((await req.json().catch(() => ({}))) as Record<string, unknown>, true);
  if ("error" in c) return Response.json({ error: c.error }, { status: 400 });
  const r = await updateResource(new URL(req.url).searchParams.get("id") || "", c.ok);
  return r ? Response.json(r) : Response.json({ error: "not-found" }, { status: 404 });
}
