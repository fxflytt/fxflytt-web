// Admin: sales follow-up on a booking (POST ?id=…).
//   {call: {outcome, note}}                 log a call (answered/contacted marks the customer as reached)
//   {followUp: {at: "YYYY-MM-DDTHH:MM", note}} | {followUp: null}   next time to call
//   {stage: "contacted"}                     moved on the sales board
//   {stage: "lost", reason, text}            the customer said no (on the phone)
//   {newVersion: true}                     a new version of the offer (Version 2 …): a copy to change and send again; this one is closed
//   {merge: otherId}                       merge a duplicate request into this one (the other is removed)
//   {refCode} a friend's code (Tipsa en vän) · {issueCode: true} make this customer's code · {rewardGiven: friendId}
import { requireUser } from "@/lib/booking/auth.ts";
import { applyCode, issueCode, markGiven } from "@/lib/booking/referral.ts";
import { getSettings } from "@/lib/booking/settings.ts";
import { mergeInto, sameCustomer } from "@/lib/booking/merge.ts";
import { getBooking, saveBooking, deleteBooking, createBooking, CALL_OUTCOMES, DECLINE_REASONS, type CallOutcome, type DeclineReason } from "@/lib/booking/store.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const err = (e: string, s = 400) => Response.json({ error: e }, { status: s });
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function POST(req: Request) {
  const u = await requireUser(req); if (u instanceof Response) return u;
  const b = await getBooking(new URL(req.url).searchParams.get("id") || "");
  if (!b) return err("not-found", 404);
  const d = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const now = Date.now();
  if (d.call && typeof d.call === "object") {
    const c = d.call as { outcome?: unknown; note?: unknown };
    const outcome = c.outcome as CallOutcome;
    if (!(outcome in CALL_OUTCOMES)) return err("Välj vad som hände.");
    const note = str(c.note, 500);
    b.calls = [...(b.calls || []), { at: now, by: u.name, outcome, note }].slice(-50);
    if (outcome === "answered" || outcome === "contacted" || outcome === "callback") b.contactedAt = b.contactedAt || now;
    await saveBooking(b, `Samtal: ${CALL_OUTCOMES[outcome]}${note ? " – " + note : ""}`, u.name);
  } else if ("followUp" in d) {
    if (d.followUp === null) { b.followUp = undefined; await saveBooking(b, "Uppföljning borttagen", u.name); }
    else {
      const f = d.followUp as { at?: unknown; note?: unknown };
      const at = str(f?.at, 16);
      if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(at)) return err("Välj dag och tid.");
      b.followUp = { at, note: str(f.note, 300), by: u.name };
      await saveBooking(b, `Ringa igen ${at.replace("T", " kl. ")}${b.followUp.note ? " – " + b.followUp.note : ""}`, u.name);
    }
  } else if (d.stage === "contacted") {
    if (b.status !== "new") return err("Bara nya förfrågningar.");
    b.contactedAt = b.contactedAt || now;
    b.calls = [...(b.calls || []), { at: now, by: u.name, outcome: "contacted" as CallOutcome, note: "" }].slice(-50);
    await saveBooking(b, "Markerad som kontaktad", u.name);
  } else if (d.stage === "lost") {
    if (b.status === "signed" || b.status === "done") return err("Bokningen är redan signerad – använd Avboka.");
    const reason = (d.reason as DeclineReason) in DECLINE_REASONS ? (d.reason as DeclineReason) : "other";
    const text = str(d.text, 400);
    b.status = "declined"; b.declinedAt = now; b.decline = { reason, ...(text ? { text } : {}) }; b.followUp = undefined;
    await saveBooking(b, `Förlorad: ${DECLINE_REASONS[reason]}${text ? " – " + text : ""}`, u.name);
  } else if ("refCode" in d) {
    try { const msg = await applyCode(b, d.refCode, await getSettings()); await saveBooking(b, msg, u.name); }
    catch (e) { return err((e as Error).message); }
  } else if (d.issueCode === true) {
    if (b.status !== "done" && b.status !== "signed") return err("Koden ges efter flytten.");
    const had = !!b.refCode; const code = await issueCode(b); if (!had) await saveBooking(b, `Kod för Tipsa en vän: ${code}`, u.name);
  } else if (typeof d.rewardGiven === "string") {
    try { await markGiven(b, d.rewardGiven, u.name); } catch (e) { return err((e as Error).message); }
  } else if (d.newVersion === true) {
    if (b.status === "signed" || b.status === "done" || b.signedAt) return err("Offerten är redan signerad.");
    if (b.nextId) return err("Det finns redan en nyare version.");
    const v = (b.version || 1) + 1;
    const n = await createBooking(b.source, { ...b.data, price: undefined }, {
      offer: b.offer ? { ...b.offer, lines: [...b.offer.lines] } : undefined, extras: b.extras, pkgChoiceOff: b.pkgChoiceOff,
      date: b.date, time: b.time, durationH: b.durationH, lead: b.lead, referral: b.referral, calls: b.calls, version: v, prevId: b.id,
      history: [{ at: now, what: `Version ${v} – kopia av ${b.id}`, by: u.name }],
    });
    b.nextId = n.id; b.status = "declined"; b.declinedAt = now; b.decline = { reason: "other", text: `Ersatt av version ${v} (${n.id})` }; b.followUp = undefined;
    await saveBooking(b, `Ersatt av version ${v}: ${n.id}`, u.name);
    return Response.json(n);
  } else if (typeof d.merge === "string") {
    const o = await getBooking(d.merge);
    if (!o) return err("Hittar inte den andra bokningen.");
    if (!sameCustomer(b, o)) return err("Bokningarna har inte samma telefon eller e-post.");
    try { mergeInto(b, o); } catch (e) { return err((e as Error).message); }
    await saveBooking(b, `Sammanslagen med ${o.id} (dubblett)`, u.name);
    await deleteBooking(o.id);
  } else return err("Okänd åtgärd.");
  return Response.json(b);
}
