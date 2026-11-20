// Everything the AI team sends to a customer goes through here (Elsa's answers, Maja's receipt, Oskar's e-mails and SMS).
// Testläge (Inställningar → AI-teamet): nothing reaches the customer – the e-mail goes to the office's test address and
// the SMS to the office's test number (or nowhere), marked with who it would have gone to.
import { getSettings, type Settings } from "../booking/settings.ts";
import { send, COMPANY_TO } from "../mail/send.ts";
import { sendSms } from "../sms/send.ts";

type Mail = { subject: string; text: string; html: string };
type Thread = Parameters<typeof send>[3];
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Rewrites an e-mail for test mode: to the test address, with a banner saying who would have got it. */
export function testMail(to: string, m: Mail): Mail {
  const banner = `TESTLÄGE – det här mejlet skulle ha skickats till ${to}. Kunden har inte fått det.`;
  const html = m.html.replace(/<body([^>]*)>/i, `<body$1><div style="background:#fff4e5;border:2px dashed #e8650a;color:#8a4b00;padding:10px 14px;margin:0 0 14px;font:600 14px Arial,sans-serif">${esc(banner)}</div>`);
  return { subject: `[TEST → ${to}] ${m.subject}`, text: `${banner}\n\n${m.text}`, html: html === m.html ? `<p style="color:#8a4b00"><b>${esc(banner)}</b></p>${m.html}` : html };
}

/** Sends an e-mail from the AI team. Returns the raw message (for the Sent folder) and whether it was a test. */
export async function teamMail(to: string, m: Mail, replyTo?: string, thread?: Thread, s?: Settings): Promise<{ raw: string; test: boolean }> {
  const st = s || await getSettings();
  if (st.aiTestMode) return { raw: await send(st.aiTestTo || COMPANY_TO, testMail(to, m), replyTo, thread ? { fromName: thread.fromName } : undefined), test: true };
  return { raw: await send(to, m, replyTo, thread), test: false };
}

/** Sends an SMS from the AI team. In test mode: to the test number, or not at all when none is set. */
export async function teamSms(to: string, text: string, s?: Settings): Promise<{ test: boolean; sent: boolean }> {
  const st = s || await getSettings();
  if (st.aiTestMode) {
    if (!st.aiTestPhone) return { test: true, sent: false };
    await sendSms(st.aiTestPhone, `[TEST → ${to}] ${text}`);
    return { test: true, sent: true };
  }
  await sendSms(to, text);
  return { test: false, sent: true };
}
