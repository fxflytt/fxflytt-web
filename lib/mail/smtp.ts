// Minimal SMTP client (no dependencies) for sending the quote requests from the site.
// Uses implicit TLS (port 465) against the Inleed mail server by default.
import tls from "node:tls";
import net from "node:net";

export type SmtpOptions = {
  host: string;
  port: number;
  user: string;
  pass: string;
  secure?: boolean; // true = implicit TLS (default). false is only used by the tests.
  timeoutMs?: number;
};

export type Mail = {
  from: string;
  to: string;
  replyTo?: string;
  subject: string;
  text: string;
};

const clean = (s: string) => s.replace(/[\r\n]+/g, " ").trim();
const b64 = (s: string) => Buffer.from(s, "utf8").toString("base64");
const encWord = (s: string) => `=?UTF-8?B?${b64(clean(s))}?=`;

export function buildMessage(m: Mail, date = new Date()): string {
  const domain = m.from.split("@")[1] || "localhost";
  const id = `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}@${domain}`;
  const body = b64(m.text).replace(/.{1,76}/g, "$&\r\n");
  const headers = [
    `From: ${encWord("FX Flytt – webbplats")} <${clean(m.from)}>`,
    `To: <${clean(m.to)}>`,
    ...(m.replyTo ? [`Reply-To: <${clean(m.replyTo)}>`] : []),
    `Subject: ${encWord(m.subject)}`,
    `Date: ${date.toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${id}>`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
  ];
  return headers.join("\r\n") + "\r\n\r\n" + body;
}

export async function sendMail(opt: SmtpOptions, mail: Mail): Promise<void> {
  const socket: net.Socket = opt.secure === false
    ? net.connect(opt.port, opt.host)
    : tls.connect({ host: opt.host, port: opt.port, servername: opt.host });
  socket.setEncoding("utf8");
  socket.setTimeout(opt.timeoutMs ?? 15000);

  let buf = "";
  let waiter: ((line: string) => void) | null = null;
  let failure: Error | null = null;
  const fail = (e: Error) => { failure = e; if (waiter) { const w = waiter; waiter = null; w(""); } };
  socket.on("error", fail);
  socket.on("timeout", () => { fail(new Error("SMTP timeout")); socket.destroy(); });
  socket.on("data", (d: string) => {
    buf += d;
    // A full reply ends with a line "NNN text" (no dash after the code).
    const m = buf.match(/(?:^|\r\n)(\d{3}) [^\r\n]*\r\n$/);
    if (m && waiter) { const w = waiter; waiter = null; const r = buf; buf = ""; w(r); }
  });

  const read = () => new Promise<string>((resolve) => {
    if (failure) return resolve("");
    if (/(?:^|\r\n)\d{3} [^\r\n]*\r\n$/.test(buf)) { const r = buf; buf = ""; return resolve(r); }
    waiter = resolve;
  });
  const expect = async (codes: number[], step: string) => {
    const r = await read();
    if (failure) throw failure;
    const code = Number(r.trim().split(/\r\n/).pop()!.slice(0, 3));
    if (!codes.includes(code)) throw new Error(`SMTP ${step} failed: ${code}`);
  };
  const cmd = async (line: string, codes: number[], step: string) => {
    socket.write(line + "\r\n");
    await expect(codes, step);
  };

  try {
    await expect([220], "greeting");
    await cmd(`EHLO ${mail.from.split("@")[1] || "localhost"}`, [250], "EHLO");
    await cmd("AUTH LOGIN", [334], "AUTH");
    await cmd(b64(opt.user), [334], "AUTH user");
    await cmd(b64(opt.pass), [235], "AUTH pass");
    await cmd(`MAIL FROM:<${clean(mail.from)}>`, [250], "MAIL FROM");
    await cmd(`RCPT TO:<${clean(mail.to)}>`, [250, 251], "RCPT TO");
    await cmd("DATA", [354], "DATA");
    await cmd(buildMessage(mail) + "\r\n.", [250], "send");
    socket.write("QUIT\r\n");
  } finally {
    socket.end();
  }
}
