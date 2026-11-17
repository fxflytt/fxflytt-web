// Admin: the notification feed behind the bell.
//   GET                → { notes, read }   (the user's read state, shared by all their devices)
//   POST {id}          mark one as read
//   POST {all:true}    mark all as read
import { requireUser } from "@/lib/booking/auth.ts";
import { listNotes, readState, markRead } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const [notes, read] = await Promise.all([listNotes(), readState(u.id)]);
  return Response.json({ notes, read }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const d = (await req.json().catch(() => ({}))) as { id?: unknown; all?: unknown };
  return Response.json({ read: await markRead(u.id, d.all === true ? null : String(d.id || "")) });
}
