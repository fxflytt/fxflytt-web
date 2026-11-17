// Admin: one action on many bookings at once (from "Välj flera" in the list).
//   POST { ids: [...], action: "lost" | "remind" | "delete" | "campaign" | "nomarketing", subject?, text? }
//   lost        open requests/offers → Förlorad (reason "Annat", note "Massåtgärd")
//   remind      sent offers with e-mail → a reminder like the automatic one
//   campaign    customers who have not booked, with e-mail → the campaign e-mail ({namn} = first name)
//   nomarketing mark that the customer does not want campaign e-mails
//   delete      remove for good (owner)
// Answers how many were done and why the others were skipped.
import { requireUser } from "@/lib/booking/auth.ts";
import { getBooking, saveBooking, deleteBooking, issueToken } from "@/lib/booking/store.ts";
import { sendReminder } from "@/lib/booking/remind.ts";
import { campaignEmail } from "@/lib/mail/bookingEmail.ts";
import { send, mailConfigured, COMPANY_TO } from "@/lib/mail/send.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const SITE = process.env.SITE_URL || "https://www.fxflytt.se";
const OPEN = ["new", "sent"];

export async function POST(req: Request) {
  const d = (await req.json().catch(() => ({}))) as { ids?: unknown; action?: unknown; subject?: unknown; text?: unknown };
  const action = String(d.action || "");
  const u = await requireUser(req, action === "delete" ? "owner" : undefined); if (u instanceof Response) return u;
  const ids = Array.isArray(d.ids) ? [...new Set(d.ids.filter((x): x is string => typeof x === "string"))].slice(0, 300) : [];
  if (!ids.length) return err("Välj minst en bokning.");
  const subject = typeof d.subject === "string" ? d.subject.trim().slice(0, 120) : "", text = typeof d.text === "string" ? d.text.trim().slice(0, 4000) : "";
  if (action === "campaign" && (!subject || !text)) return err("Skriv ämne och text.");
  if ((action === "campaign" || action === "remind") && !mailConfigured()) return err("E-post är inte inställd.", 503);
  let done = 0; const skipped: Record<string, number> = {};
  const skip = (why: string) => { skipped[why] = (skipped[why] || 0) + 1; };
  for (const id of ids) {
    const b = await getBooking(id); if (!b) { skip("finns inte"); continue; }
    try {
      if (action === "lost") {
        if (!OPEN.includes(b.status) || b.signedAt) { skip("inte öppen"); continue; }
        b.status = "declined"; b.declinedAt = Date.now(); b.decline = { reason: "other", text: "Massåtgärd" }; b.followUp = undefined;
        await saveBooking(b, "Förlorad (markerad tillsammans med andra)", u.name);
      } else if (action === "remind") {
        if (b.status !== "sent") { skip("offerten är inte skickad"); continue; }
        if (!b.data.email) { skip("ingen e-post"); continue; }
        await sendReminder(b, "manual", u.name);
      } else if (action === "campaign") {
        if (b.status === "signed" || b.status === "done" || b.signedAt) { skip("redan bokad"); continue; }
        if (!b.data.email) { skip("ingen e-post"); continue; }
        if (b.noMarketing) { skip("vill inte ha utskick"); continue; }
        const url = b.status === "sent" && b.token ? `${SITE}/signera?t=${b.token}` : b.status === "new" && b.offer ? `${SITE}/signera?t=${await issueToken(b)}` : undefined;
        await send(b.data.email, campaignEmail(b, subject, text, url), COMPANY_TO);
        b.campaigns = [...(b.campaigns || []), { at: Date.now(), subject, by: u.name }].slice(-20);
        await saveBooking(b, `Kampanj skickad: ${subject}`, u.name);
      } else if (action === "nomarketing") {
        b.noMarketing = true; await saveBooking(b, "Vill inte ha kampanjmejl", u.name);
      } else if (action === "delete") {
        await deleteBooking(b.id);
      } else return err("Okänd åtgärd.");
      done++;
    } catch (e) { skip((e as Error).message.slice(0, 60)); }
  }
  return Response.json({ done, skipped });
}
