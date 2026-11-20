// Every 10 minutes (vercel.json, needs Vercel Pro): Elsa reads new e-mail in info@ even when nobody has the admin open.
// Only one read runs at a time; if the admin page or the morning job is already reading, this one is skipped.
import { kvConfigured } from "@/lib/booking/kv.ts";
import { runInboxSync } from "@/lib/agents/run.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.get("authorization") !== `Bearer ${secret}`) return new Response("unauthorized", { status: 401 });
  if (!kvConfigured()) return Response.json({ error: "storage" }, { status: 503 });
  try {
    // Skipped if a read finished in the last 5 minutes (the admin page reads too while it is open).
    const r = await runInboxSync(5 * 60_000, 5);
    return Response.json({ ok: true, ...r, urgent: r.urgent.length });
  } catch (e) { return Response.json({ error: (e as Error).message }, { status: 500 }); }
}
