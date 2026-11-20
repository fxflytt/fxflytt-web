// Reads the company inbox (info@fxflytt.se at Inleed) over IMAP – the same login as the outgoing mail
// (SMTP_USER / SMTP_PASS in Vercel). The inbox is opened READ-ONLY: nothing is deleted, moved or marked as read,
// so Outlook / the phone / webmail look exactly as before. IMAP_HOST / IMAP_PORT can override the server.
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject } from "mailparser";

export type RawMail = {
  uid: number; messageId: string; inReplyTo: string; references: string[];
  from: string; fromName: string; to: string; subject: string; date: number;
  text: string; attachments: string[];
  // Booking numbers and offer links anywhere in the e-mail, also in the quoted part (the customer answering our e-mail).
  refs?: { ids: string[]; tokens: string[] };
};

const conf = () => ({
  host: process.env.IMAP_HOST || process.env.SMTP_HOST || "mail.inleed.com",
  port: Number(process.env.IMAP_PORT || 993),
  secure: true,
  auth: { user: process.env.SMTP_USER || "", pass: process.env.SMTP_PASS || "" },
  logger: false as const,
  disableAutoIdle: true,
  socketTimeout: 30_000,
});

const first = (a?: AddressObject | AddressObject[]) => (Array.isArray(a) ? a[0] : a)?.value?.[0];

// Plain text of the message without the quoted earlier mails (keeps what the customer just wrote).
export function cleanText(text: string): string {
  const lines = text.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const l of lines) {
    // "Den 3 nov. 2026 kl. 10:00 skrev Anna <a@b.se>:" / "On Tue, Nov 3, 2026 … Anna <a@b.se> wrote:"
    const t = l.trim();
    if (t.length < 300 && /\d/.test(t) && /(\bwrote|\bskrev|\bschrieb|a écrit)\b.*:$|(\bwrote|\bskrev|\bschrieb|a écrit):$/i.test(t)) break;
    if (/^-{2,}\s*(Original Message|Ursprungligt meddelande|Vidarebefordrat)/i.test(l.trim())) break;
    if (/^(Från|From):\s/.test(l) && out.length > 3) break;
    if (/^>/.test(l)) continue;
    out.push(l);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Booking numbers (FX…) and offer links (/signera?t=…) in the whole e-mail, quoted part included. */
export function refsOf(all: string): { ids: string[]; tokens: string[] } {
  const ids = [...new Set(all.match(/\bFX\d{6}-[0-9A-F]{6}\b/g) || [])].slice(0, 5);
  const tokens = [...new Set([...all.matchAll(/signera\?t=([A-Za-z0-9_-]{8,})/g)].map((m) => m[1]))].slice(0, 5);
  return { ids, tokens };
}

/**
 * Fetches messages newer than `afterUid` (when `uidValidity` still matches) or, the first time, from the last `firstDays` days.
 * Returns at most `max` messages, oldest first, and the mailbox state to remember.
 */
export async function fetchNew(state: { uidValidity?: string; lastUid?: number } | null, max = 15, firstDays = 3):
  Promise<{ mails: RawMail[]; uidValidity: string; lastUid: number; more: boolean }> {
  const client = new ImapFlow(conf());
  await client.connect();
  try {
    const box = await client.mailboxOpen("INBOX", { readOnly: true });
    const uidValidity = String(box.uidValidity);
    const fresh = !state || state.uidValidity !== uidValidity || !state.lastUid;
    let uids: number[];
    if (fresh) {
      const r = await client.search({ since: new Date(Date.now() - firstDays * 864e5) }, { uid: true });
      uids = Array.isArray(r) ? r : [];
    } else {
      const r = await client.search({ uid: `${state!.lastUid! + 1}:*` }, { uid: true });
      // "N:*" always returns the newest message, even when it is older than N.
      uids = (Array.isArray(r) ? r : []).filter((u) => u > state!.lastUid!);
    }
    uids.sort((a, b) => a - b);
    const take = uids.slice(0, max);
    const mails: RawMail[] = [];
    if (take.length) {
      for await (const m of client.fetch(take.join(","), { uid: true, source: { maxLength: 400_000 }, internalDate: true }, { uid: true })) {
        if (!m.source) continue;
        const p = await simpleParser(m.source, { skipImageLinks: true, skipTextToHtml: true });
        const f = first(p.from), t = first(p.to);
        const raw = p.text || (typeof p.html === "string" ? p.html.replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ") : "");
        mails.push({
          uid: m.uid, messageId: p.messageId || "", inReplyTo: p.inReplyTo || "",
          references: Array.isArray(p.references) ? p.references : p.references ? [p.references] : [],
          from: (f?.address || "").toLowerCase(), fromName: f?.name || "", to: (t?.address || "").toLowerCase(),
          subject: (p.subject || "(ingen rubrik)").slice(0, 300),
          date: (p.date || (m.internalDate instanceof Date ? m.internalDate : new Date())).getTime(),
          text: cleanText(raw).slice(0, 12_000),
          refs: refsOf(`${p.subject || ""}\n${p.text || ""}\n${typeof p.html === "string" ? p.html : ""}`),
          attachments: p.attachments.filter((a) => a.contentDisposition === "attachment" || !a.related).map((a) => a.filename || a.contentType).slice(0, 10),
        });
      }
    }
    mails.sort((a, b) => a.uid - b.uid);
    const lastUid = take.length ? take[take.length - 1] : fresh ? Math.max(0, Number(box.uidNext || 1) - 1) : state!.lastUid!;
    return { mails, uidValidity, lastUid, more: uids.length > take.length };
  } finally {
    await client.logout().catch(() => client.close());
  }
}

/** Puts a copy of an e-mail we sent into the Sent folder, so it shows up in Outlook / webmail too. Best effort. */
export async function saveToSent(rawMessage: string): Promise<boolean> {
  const client = new ImapFlow(conf());
  try {
    await client.connect();
    const boxes = await client.list();
    const sent = boxes.find((b) => b.specialUse === "\\Sent") || boxes.find((b) => /^(INBOX[./])?(Sent|Skickat|Sent Items|Skickade)$/i.test(b.path));
    if (!sent) return false;
    await client.append(sent.path, rawMessage, ["\\Seen"]);
    return true;
  } catch { return false; }
  finally { await client.logout().catch(() => client.close()); }
}
