// Admin: staff and vehicles. List (GET), add (POST), change or archive (PATCH ?id=).
// POST ?id=…&do=invite makes a new PIN for the crew app (shown once); &do=disable turns the app off for the person.
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { listResources, addResource, updateResource, cleanResource, publicResource } from "@/lib/booking/team.ts";
import { invite, disable } from "@/lib/booking/crew.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const noStorage = () => Response.json({ error: "Lagring saknas (Upstash Redis i Vercel)." }, { status: 503 });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  return Response.json({ resources: (await listResources()).map(publicResource) });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const q = new URL(req.url).searchParams, what = q.get("do");
  if (what === "invite" || what === "disable") {
    try {
      if (what === "disable") { await disable(q.get("id") || ""); return Response.json({ ok: true }); }
      const r = await invite(q.get("id") || "");
      return Response.json({ pin: r.pin, person: publicResource(r.person) });
    } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
  }
  const c = cleanResource((await req.json().catch(() => ({}))) as Record<string, unknown>);
  if ("error" in c) return Response.json({ error: c.error }, { status: 400 });
  try { return Response.json(publicResource(await addResource(c.ok))); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function PATCH(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return noStorage();
  const c = cleanResource((await req.json().catch(() => ({}))) as Record<string, unknown>, true);
  if ("error" in c) return Response.json({ error: c.error }, { status: 400 });
  const r = await updateResource(new URL(req.url).searchParams.get("id") || "", c.ok);
  return r ? Response.json(publicResource(r)) : Response.json({ error: "not-found" }, { status: 404 });
}
