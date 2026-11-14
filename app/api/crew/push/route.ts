// Crew app notifications: GET {publicKey, on}, POST = subscribe this phone, DELETE ?endpoint= = stop.
import { crewUser } from "@/lib/booking/crew.ts";
import { vapid, listSubs, addSub, removeSub, notifyAll } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const mine = (await listSubs()).filter((s) => s.userId === "crew:" + me.id).map((s) => s.endpoint);
  return Response.json({ publicKey: (await vapid()).publicKey, endpoints: mine });
}

export async function POST(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  try {
    const ua = req.headers.get("user-agent") || "";
    await addSub({ id: "crew:" + me.id, name: me.name }, (await req.json().catch(() => ({}))) as Record<string, unknown>, /iPhone|iPad/.test(ua) ? "iPhone" : /Android/.test(ua) ? "Android" : "Telefon");
    await notifyAll({ title: "Notiser är på ✓", body: "Du får en notis när du får ett nytt jobb eller när ett jobb ändras.", url: "/jobb", tag: "crew-test" }, (s) => s.userId === "crew:" + me.id);
    return Response.json({ ok: true });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

export async function DELETE(req: Request) {
  const me = await crewUser(req); if (!me) return Response.json({ error: "unauthorized" }, { status: 401 });
  const ep = new URL(req.url).searchParams.get("endpoint") || "";
  await removeSub((s) => s.userId === "crew:" + me.id && s.endpoint === ep);
  return Response.json({ ok: true });
}
