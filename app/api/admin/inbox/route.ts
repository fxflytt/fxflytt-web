// Admin: Inkorgen (e-mail to info@, sorted by the AI).
//   GET                                   → { mails, state, ai }
//   POST ?sync=1 | ?sync=auto             read new e-mail now (auto: skipped if it ran in the last 4 minutes)
//   POST ?id=  {action:"reply", text}     send the reply to the customer (and a copy to Skickat)
//   POST ?id=  {action:"redraft", hint}   a new draft from the AI, optionally following the office's words
//   POST ?id=  {action:"done"|"reopen"|"spam"}
//   POST ?id=  {action:"request"}         make a new request (Offerter) from the e-mail
//   POST ?id=  {action:"complaint"}       move it to Klagomål
//   POST ?id=  {action:"link", bookingId} connect it to a booking
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { getBooking, saveBooking, createBooking } from "@/lib/booking/store.ts";
import { send, mailConfigured } from "@/lib/mail/send.ts";
import { aiConfigured } from "@/lib/agents/claude.ts";
import { listMails, getMail, saveMail, getState, redraft, replyEmail, type InMail } from "@/lib/agents/inbox.ts";
import { addComplaint, assess } from "@/lib/agents/complaints.ts";
import { runInboxSync } from "@/lib/agents/run.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function GET(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const [mails, state, s] = await Promise.all([listMails(300), getState(), getSettings()]);
  return Response.json({ mails, state, ai: aiConfigured(), mail: mailConfigured(), on: s.aiInboxOn });
}

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const q = new URL(req.url).searchParams;
  if (q.get("sync")) {
    const r = await runInboxSync(q.get("sync") === "auto" ? 4 * 60_000 : 0);
    if (r.error) return err("Kunde inte läsa inkorgen: " + r.error, 502);
    return Response.json({ ...r, urgent: r.urgent.length });
  }
  const m = await getMail(q.get("id") || "");
  if (!m) return err("Hittar inte mejlet.", 404);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const keep = (await getSettings()).mailKeepDays;
  const save = async (x: InMail) => { await saveMail(x, keep); return Response.json(x); };
  const b = m.bookingId ? await getBooking(m.bookingId) : null;

  switch (d.action) {
    case "reply": {
      const text = typeof d.text === "string" ? d.text.trim().slice(0, 6000) : "";
      if (!text) return err("Skriv ett svar först.");
      if (!m.from || !/@/.test(m.from)) return err("Mejlet har ingen avsändare att svara till.");
      if (!mailConfigured()) return err("E-post är inte inställd.", 503);
      const mail = replyEmail(m, text);
      let raw: string;
      try { raw = await send(m.from, mail, undefined, { inReplyTo: m.messageId || undefined, references: m.references, fromName: "FX Flytt" }); }
      catch (e) { return err("Kunde inte skicka: " + (e as Error).message, 502); }
      // A copy in Skickat, so the reply is also seen in Outlook / webmail. Failing here must not fail the reply.
      try { const { saveToSent } = await import("@/lib/mail/imap.ts"); await saveToSent(raw); } catch { /* ignore */ }
      m.answers = [...(m.answers || []), { at: Date.now(), by: u.name, text }].slice(-10);
      m.status = "answered"; m.draft = "";
      if (b) await saveBooking(b, `Svarade på e-post: "${m.subject.slice(0, 60)}"`, u.name);
      return save(m);
    }
    case "redraft": {
      if (!aiConfigured()) return err("AI är inte inställt (ANTHROPIC_API_KEY).", 503);
      try { m.draft = await redraft(m, b, typeof d.hint === "string" ? d.hint : "", today()); m.aiError = undefined; }
      catch (e) { return err((e as Error).message, 502); }
      return save(m);
    }
    case "done": m.status = "done"; m.doneBy = u.name; return save(m);
    case "reopen": m.status = "new"; m.doneBy = undefined; return save(m);
    case "spam": m.status = "done"; m.category = "spam"; m.doneBy = u.name; return save(m);
    case "draft": m.draft = typeof d.text === "string" ? d.text.slice(0, 6000) : m.draft; return save(m);
    case "request": {
      if (m.bookingId) return err("Mejlet hör redan till en bokning.");
      const e = m.extracted;
      const n = await createBooking("admin", {
        name: e?.name || m.fromName || m.from, phone: e?.phone || "", email: m.from,
        from: e?.from || "", to: e?.to || "", date: e?.date || "", size: e?.size || "",
        areaM2: m.estimate ? String(m.estimate.m2) : "", distanceKm: m.estimate?.km,
        message: `Från e-post (${new Date(m.date).toLocaleDateString("sv-SE")}): ${m.subject}\n\n${m.text.slice(0, 2500)}`,
      }, {
        ...(m.estimate?.bas ? { offer: { total: m.estimate.bas, lines: m.estimate.lines || [], note: `Prisförslag: ${m.estimate.from}–${m.estimate.to} ca ${m.estimate.km} km, ${m.estimate.m2} m². Kontrollera adresserna innan offerten skickas.` } } : {}),
        history: [{ at: Date.now(), what: "Skapad från e-post i AI-team → E-post", by: u.name }],
      });
      m.bookingId = n.id; await saveMail(m, keep);
      return Response.json({ mail: m, booking: n });
    }
    case "complaint": {
      if (m.complaintId) return err("Det finns redan ett klagomål för mejlet.");
      let a = null;
      try { if (aiConfigured()) a = await assess(m.text, m.subject, b); } catch { /* the office can assess later */ }
      const c = await addComplaint({ source: "email", name: m.fromName || b?.data.name, email: m.from, phone: b?.data.phone, bookingId: b?.id, mailId: m.id,
        subject: m.subject, text: m.text, assessment: a, by: u.name });
      m.complaintId = c.id; m.category = "klagomal"; if (a?.draft && !m.draft) m.draft = a.draft;
      await saveMail(m, keep);
      return Response.json({ mail: m, complaint: c });
    }
    case "link": {
      const x = await getBooking(typeof d.bookingId === "string" ? d.bookingId.trim().toUpperCase() : "");
      if (!x) return err("Hittar inte bokningen.");
      m.bookingId = x.id; return save(m);
    }
    default: return err("Okänd åtgärd.");
  }
}
