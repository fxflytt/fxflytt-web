// SMS through 46elks (Swedish SMS service, pay per message): https://46elks.se
// Vercel environment: ELKS_API_USER and ELKS_API_PASSWORD (from the 46elks dashboard), optional SMS_FROM –
// the sender shown on the phone, max 11 letters/digits (default "FXFlytt"). The customer cannot answer a named
// sender, so every SMS ends with our phone number.
export const smsConfigured = () => Boolean(process.env.ELKS_API_USER && process.env.ELKS_API_PASSWORD);
export const SMS_FROM = () => (process.env.SMS_FROM || "FXFlytt").replace(/[^A-Za-z0-9]/g, "").slice(0, 11) || "FXFlytt";
export const SMS_MAX = 320;   // two SMS at most

/** Swedish mobile number → +467…; null for landlines and anything that is not a phone number. */
export function mobileE164(p?: string): string | null {
  let d = String(p || "").replace(/[\s\-().]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (d.startsWith("0")) d = "+46" + d.slice(1);
  if (/^46\d+$/.test(d)) d = "+" + d;
  return /^\+467[02369]\d{7}$/.test(d) ? d : null;
}

export async function sendSms(to: string, message: string, fetchImpl: typeof fetch = fetch): Promise<string> {
  const user = process.env.ELKS_API_USER, pass = process.env.ELKS_API_PASSWORD;
  if (!user || !pass) throw new Error("SMS är inte inställt (ELKS_API_USER / ELKS_API_PASSWORD i Vercel).");
  const num = mobileE164(to);
  if (!num) throw new Error("Inget mobilnummer att skicka SMS till.");
  const text = message.trim().slice(0, SMS_MAX);
  if (!text) throw new Error("Tomt SMS.");
  const res = await fetchImpl("https://api.46elks.com/a1/sms", {
    method: "POST",
    headers: { Authorization: "Basic " + Buffer.from(`${user}:${pass}`).toString("base64"), "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ from: SMS_FROM(), to: num, message: text }).toString(),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`SMS-tjänsten svarade ${res.status}: ${body.slice(0, 120)}`);
  try { return String((JSON.parse(body) as { id?: string }).id || ""); } catch { return ""; }
}

// The end of every SMS: the customer cannot answer the sender name, so we give the number.
export const smsFooter = "Frågor? Ring 076-300 07 23 /FX Flytt";
