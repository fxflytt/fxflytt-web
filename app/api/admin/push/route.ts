// Push notifications for the logged-in admin user.
//   GET              { publicKey, mine: devices of this user }
//   POST             body = PushSubscription (from the browser) → this device gets notifications
//   POST ?test=1     sends a test notification to this user's devices
//   DELETE ?endpoint= this device stops getting notifications
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { vapid, listSubs, addSub, removeSub, notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const mine = async (uid: string) => (await listSubs()).filter((s) => s.userId === uid).map(({ id, device, createdAt, endpoint }) => ({ id, device, createdAt, endpoint }));

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  return Response.json({ publicKey: (await vapid()).publicKey, mine: await mine(u.id) });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  if (new URL(req.url).searchParams.get("test") === "1") {
    const n = await notifyAll({ title: "FX Flytt", body: "Det fungerar! Här kommer notiser om nya förfrågningar.", url: "/admin", tag: "test" }, (s) => s.userId === u.id);
    return n ? Response.json({ ok: true, sent: n }) : Response.json({ error: "Ingen enhet tog emot notisen." }, { status: 400 });
  }
  try {
    const ua = req.headers.get("user-agent") || "";
    const device = /iPhone|iPad/.test(ua) ? "iPhone/iPad" : /Android/.test(ua) ? "Android" : /Mac/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : "Dator";
    await addSub(u, (await req.json().catch(() => ({}))) as Record<string, unknown>, device);
    return Response.json({ ok: true, mine: await mine(u.id) });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const ep = new URL(req.url).searchParams.get("endpoint") || "";
  await removeSub((s) => s.userId === u.id && s.endpoint === ep);
  return Response.json({ ok: true, mine: await mine(u.id) });
}
