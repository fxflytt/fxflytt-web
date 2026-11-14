// Owner only: settings (GET, PATCH). POST e-mails a sample review request to the company inbox.
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings, updateSettings } from "@/lib/booking/settings.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  return Response.json(await getSettings());
}

export async function PATCH(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return Response.json({ error: "Lagring saknas." }, { status: 503 });
  try { return Response.json(await updateSettings((await req.json().catch(() => ({}))) as Record<string, unknown>)); }
  catch (e) { return Response.json({ error: (e as Error).message }, { status: 400 }); }
}

// Sends a sample of the review e-mail to the company inbox, so the owner can see it before switching it on.
export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  const { send, mailConfigured, COMPANY_TO } = await import("@/lib/mail/send.ts");
  const { reviewEmail } = await import("@/lib/mail/bookingEmail.ts");
  if (!mailConfigured()) return Response.json({ error: "E-post är inte inställd." }, { status: 503 });
  const s = await getSettings();
  if (!s.reviewUrl) return Response.json({ error: "Lägg in länken till Google först." }, { status: 400 });
  const sample = { id: "FX000000-TEST00", data: { name: "Anna Exempel" } } as Parameters<typeof reviewEmail>[0];
  const m = reviewEmail(sample, s.reviewUrl);
  try { await send(COMPANY_TO, { ...m, subject: "[Test] " + m.subject }); }
  catch (e) { return Response.json({ error: "Kunde inte skicka: " + (e as Error).message }, { status: 502 }); }
  return Response.json({ ok: true, to: COMPANY_TO });
}
