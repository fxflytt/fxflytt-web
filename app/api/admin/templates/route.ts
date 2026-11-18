// Admin: offer templates. GET list · POST {name, size, total, lines, customerNote} (same name = update) · DELETE ?id=
import { requireUser } from "@/lib/booking/auth.ts";
import { listTemplates, saveTemplate, deleteTemplate } from "@/lib/booking/templates.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  return Response.json({ templates: await listTemplates() });
}
export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  try { return Response.json(await saveTemplate((await req.json().catch(() => ({}))) as Record<string, unknown>, u.name)); }
  catch (e) { return err((e as Error).message); }
}
export async function DELETE(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  await deleteTemplate(new URL(req.url).searchParams.get("id") || "");
  return Response.json({ ok: true });
}
