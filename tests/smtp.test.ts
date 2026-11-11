import { test } from "node:test";
import assert from "node:assert/strict";
import net from "node:net";
import { sendMail, buildMessage } from "../lib/mail/smtp.ts";

function fakeServer(passOk = true) {
  const log: string[] = [];
  const server = net.createServer((s) => {
    s.setEncoding("utf8");
    let inData = false, data = "", buf = "";
    s.write("220 fake ESMTP\r\n");
    s.on("data", (d: string) => {
      buf += d;
      let i;
      while ((i = buf.indexOf("\r\n")) >= 0) {
        const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (inData) {
          if (line === ".") { inData = false; log.push("DATA:" + data); s.write("250 queued\r\n"); } else data += line + "\n";
          continue;
        }
        log.push(line);
        if (line.startsWith("EHLO")) s.write("250-fake\r\n250-AUTH LOGIN\r\n250 OK\r\n");
        else if (line === "AUTH LOGIN") s.write("334 VXNlcm5hbWU6\r\n");
        else if (log.length === 3) s.write("334 UGFzc3dvcmQ6\r\n");
        else if (log.length === 4) s.write(passOk ? "235 ok\r\n" : "535 bad\r\n");
        else if (line === "DATA") { inData = true; s.write("354 go\r\n"); }
        else if (line === "QUIT") { s.write("221 bye\r\n"); s.end(); }
        else s.write("250 ok\r\n");
      }
    });
  });
  return new Promise<{ port: number; log: string[]; close: () => void }>((r) =>
    server.listen(0, () => r({ port: (server.address() as net.AddressInfo).port, log, close: () => server.close() })));
}

const mail = { from: "info@fxflytt.se", to: "info@fxflytt.se", replyTo: "kund@mail.se", subject: "Ny offert – Åsa", text: "Från: Kungsör\nPris: 10 000 kr" };

test("sends a full SMTP conversation", async () => {
  const srv = await fakeServer();
  await sendMail({ host: "127.0.0.1", port: srv.port, user: "info@fxflytt.se", pass: "x", secure: false }, mail);
  srv.close();
  assert.equal(srv.log[2], Buffer.from("info@fxflytt.se").toString("base64"));
  assert.ok(srv.log.includes("RCPT TO:<info@fxflytt.se>"));
  const data = srv.log.find((l) => l.startsWith("DATA:"))!;
  assert.match(data, /Reply-To: <kund@mail.se>/);
  const body = data.split("\n\n")[1].replace(/\n/g, "");
  assert.equal(Buffer.from(body, "base64").toString("utf8"), mail.text);
});

test("rejects wrong password", async () => {
  const srv = await fakeServer(false);
  await assert.rejects(sendMail({ host: "127.0.0.1", port: srv.port, user: "u", pass: "x", secure: false }, mail), /AUTH pass failed: 535/);
  srv.close();
});

test("header injection is neutralised", () => {
  const m = buildMessage({ ...mail, subject: "Hej\r\nBcc: evil@x.se", replyTo: "a@b.se\r\nBcc: evil@x.se" });
  assert.ok(!/\r\nBcc:/i.test(m));
});
