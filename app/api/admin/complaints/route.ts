// Admin: Klagomål.
//   GET                                   → { complaints }
//   POST {name, email, phone, bookingId, text, source}   new complaint from the office (the AI assesses it)
//   POST ?id= {action:"assess"}           let the AI assess it again
//   POST ?id= {action:"reply", text}      e-mail the customer (in the same thread when it came by e-mail)
//   POST ?id= {action:"damage"}           make a damage report (Personal → Skador) for the job
//   PATCH ?id= {status, severity, category, resolution, draft, note}
//   DELETE ?id=   (owner)
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getBooking, saveBooking } from "@/lib/booking/store.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { send, mailConfigured } from "@/lib/mail/send.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { listComplaints, addComplaint, updateComplaint, removeComplaint, assess, applyPatch, K_CATS } from "@/lib/agents/complaints.ts";
import { getMail, saveMail, replyEmail, replySubject } from "@/lib/agents/inbox.ts";
import { addDamage } from "@/lib/booking/damage.ts";
import { notifyAll } from "@/lib/booking/push.ts";
import { getPrices } from "@/lib/pricing/current.ts";
import { knowledge } from "@/lib/agents/knowledge.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  return Response.json({ complaints: (await listComplaints()).sort((a, b) => b.createdAt - a.createdAt), ai: aiConfigured() });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const id = new URL(req.url).searchParams.get("id");
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (!id) {
      const b = typeof d.bookingId === "string" && d.bookingId ? await getBooking(d.bookingId.trim().toUpperCase()) : null;
      if (d.bookingId && !b) return err("Hittar inte bokningen.");
      const text = typeof d.text === "string" ? d.text : "";
      let a = null;
      try { if (aiConfigured() && text.trim()) a = await assess(text, "", b, knowledge(await getPrices())); } catch { /* still saved */ }
      const c = await addComplaint({ source: d.source === "other" ? "other" : "phone", name: (d.name as string) || b?.data.name, email: (d.email as string) || b?.data.email,
        phone: (d.phone as string) || b?.data.phone, bookingId: b?.id, text, assessment: a, by: u.name });
      if (b) await saveBooking(b, `Klagomål registrerat: ${c.subject}`, u.name);
      if (c.severity === "high") await notifyAll({ cat: "complaint", title: "Allvarligt klagomål: " + (c.name || c.email), body: c.summary || c.subject, url: "/admin#klagomal", tag: c.id });
      return Response.json(c);
    }
    const cur = (await listComplaints()).find((x) => x.id === id);
    if (!cur) return err("Hittar inte klagomålet.", 404);
    const b = cur.bookingId ? await getBooking(cur.bookingId) : null;
    if (d.action === "assess") {
      if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
      const a = await assess(cur.text, cur.subject, b, knowledge(await getPrices()));
      return Response.json(await updateComplaint(id, (c) => { Object.assign(c, a); return "AI-bedömning: " + K_CATS[a.category]; }, u.name));
    }
    if (d.action === "reply") {
      const text = typeof d.text === "string" ? d.text.trim().slice(0, 6000) : "";
      if (!text) return err("Skriv ett svar först.");
      if (!cur.email) return err("Kunden har ingen e-post – ring kunden.");
      if (!mailConfigured()) return err("E-post är inte inställd.", 503);
      const m = cur.mailId ? await getMail(cur.mailId) : null;
      const mail = m ? replyEmail(m, text) : { subject: replySubject(cur.subject || "Ditt ärende hos FX Flytt"), text: `${text}\n\nFX Flytt AB · 076-300 07 23 · www.fxflytt.se`,
        html: `<!DOCTYPE html><html lang="sv"><body style="font-family:Arial,sans-serif;font-size:15px;line-height:22px;color:#14212b">${text.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, "<br>")}</p>`).join("")}<p style="color:#5b6b78;font-size:13px">FX Flytt AB · 076-300 07 23 · www.fxflytt.se</p></body></html>` };
      let raw: string;
      try { raw = await send(cur.email, mail, undefined, { inReplyTo: m?.messageId || undefined, references: m?.references, fromName: "FX Flytt" }); }
      catch (e) { return err("Kunde inte skicka: " + (e as Error).message, 502); }
      try { const { saveToSent } = await import("@/lib/mail/imap.ts"); await saveToSent(raw); } catch { /* ignore */ }
      if (m) { m.answers = [...(m.answers || []), { at: Date.now(), by: u.name, text }].slice(-10); m.status = "answered"; m.draft = ""; await saveMail(m, (await getSettings()).mailKeepDays); }
      if (b) await saveBooking(b, "Svar på klagomål skickat", u.name);
      return Response.json(await updateComplaint(id, (c) => { if (c.status === "new") c.status = "handling"; c.draft = ""; return "Svar skickat till kunden:\n" + text.slice(0, 1500); }, u.name));
    }
    if (d.action === "damage") {
      if (!b) return err("Koppla klagomålet till en bokning först.");
      if (cur.damageId) return err("Det finns redan en skaderapport.");
      const x = await addDamage({ kind: "customer", title: cur.subject.slice(0, 100), desc: cur.text.slice(0, 2000) }, u.name, { booking: { id: b.id, name: b.data.name } });
      await saveBooking(b, `Skada rapporterad: ${x.title}`, u.name);
      return Response.json(await updateComplaint(id, (c) => { c.damageId = x.id; return "Skaderapport skapad (" + x.id + ")"; }, u.name));
    }
    return err("Okänd åtgärd.");
  } catch (e) { return err((e as Error).message, 400); }
}

export async function PATCH(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const id = new URL(req.url).searchParams.get("id") || "";
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (typeof d.bookingId === "string") {
      const b = d.bookingId ? await getBooking(d.bookingId.trim().toUpperCase()) : null;
      if (d.bookingId && !b) return err("Hittar inte bokningen.");
      return Response.json(await updateComplaint(id, (c) => { c.bookingId = b?.id; return b ? "Kopplad till " + b.id : "Bokning borttagen"; }, u.name));
    }
    return Response.json(await updateComplaint(id, (c) => applyPatch(c, d), u.name));
  } catch (e) { return err((e as Error).message); }
}

export async function DELETE(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  await removeComplaint(new URL(req.url).searchParams.get("id") || "");
  return Response.json({ ok: true });
}
