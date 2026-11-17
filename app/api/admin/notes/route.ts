// Admin: the notification feed behind the bell.
//   GET                → { notes, read }   (the user's read state, shared by all their devices)
//   POST {id}          mark one as read
//   POST {all:true}    mark all as read
//   POST {prefs:{off:[cat…], sound}}   which kinds this user gets as push, and a sound in the admin page
import { requireUser } from "@/lib/booking/auth.ts";
import { listNotes, readState, markRead, getPrefs, setPrefs, NOTE_CATS } from "@/lib/booking/push.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const [notes, read, prefs] = await Promise.all([listNotes(), readState(u.id), getPrefs(u.id)]);
  return Response.json({ notes, read, prefs, cats: NOTE_CATS }, { headers: { "Cache-Control": "no-store" } });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const d = (await req.json().catch(() => ({}))) as { id?: unknown; all?: unknown; prefs?: { off?: unknown; sound?: unknown } };
  if (d.prefs && typeof d.prefs === "object") return Response.json({ prefs: await setPrefs(u.id, d.prefs) });
  return Response.json({ read: await markRead(u.id, d.all === true ? null : String(d.id || "")) });
}
