// The AI team in the booking system: four colleagues with Swedish names (changeable in Inställningar → AI-teamet),
// a shared log of what they have done, and a daily limit on how many e-mails they may send by themselves.
//   fx:ailog          list of Activity JSON, newest first (last 400)
//   fx:aisent:<day>   e-mails the team sent by itself that day
//   fx:aiplan         Nils' plan for today
import { kv, kvPipe } from "../booking/kv.ts";
import type { Settings } from "../booking/settings.ts";

export type AgentId = "elsa" | "oskar" | "maja" | "nils";
export const AGENTS: Record<AgentId, { role: string; job: string }> = {
  elsa: { role: "Kundservice – e-post", job: "Läser info@, sorterar, hittar kundens bokning, gör förfrågningar av offertmejl och skriver svar." },
  oskar: { role: "Säljare", job: "Följer upp offerter, kalkyl-leads och förlorade affärer, säljer till flyttstäd och packning, skriver ringmanus." },
  maja: { role: "Kundansvarig – klagomål", job: "Tar hand om klagomål: bedömer allvar, nästa steg och svarsdag, och skriver svar utan att lova ersättning." },
  nils: { role: "Analytiker", job: "Gör dagens plan varje morgon och veckorapporten varje måndag." },
};
export const agentName = (s: Pick<Settings, "aiNames">, id: AgentId) => s.aiNames?.[id] || id[0].toUpperCase() + id.slice(1);
/** How the colleague is written in history and logs: "Elsa (AI)". */
export const aiBy = (s: Pick<Settings, "aiNames">, id: AgentId) => `${agentName(s, id)} (AI)`;

export type Activity = { at: number; agent: AgentId; what: string; auto?: boolean; bookingId?: string; mailId?: string; complaintId?: string };

// A list in Upstash (LPUSH), so colleagues working at the same time never overwrite each other's lines.
export async function logActivity(a: Omit<Activity, "at">) {
  await kvPipe([["LPUSH", "fx:ailog", JSON.stringify({ at: Date.now(), ...a, what: a.what.slice(0, 300) })], ["LTRIM", "fx:ailog", 0, 399]]);
}
export async function listActivity(n = 100): Promise<Activity[]> {
  return (await kv<string[]>(["LRANGE", "fx:ailog", 0, n - 1])).map((x) => JSON.parse(x) as Activity);
}

const day = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
/** Takes one from today's quota for an e-mail the team sends by itself. False when the limit is reached. */
export async function takeQuota(max: number): Promise<boolean> {
  if (max <= 0) return false;
  const k = "fx:aisent:" + day();
  const n = Number(await kv(["INCR", k]));
  if (n === 1) await kv(["EXPIRE", k, 3 * 86400]);
  if (n > max) { await kv(["DECR", k]); return false; }
  return true;
}
export async function sentToday(): Promise<number> {
  return Number((await kv<string | null>(["GET", "fx:aisent:" + day()])) || 0);
}

// The line under every e-mail the team sends by itself, so the customer knows it was written by an AI assistant.
export const aiSignature = (name: string, role: string, lang: "sv" | "en" = "sv") => lang === "en"
  ? `Best regards\n${name}, FX Flytt customer service\n(Digital assistant – a colleague in the office also reads your e-mail. Call +46 76-300 07 23 if it is urgent.)`
  : `Vänliga hälsningar\n${name}, ${role.toLowerCase()} på FX Flytt\n(Digital assistent – en kollega på kontoret läser också ditt mejl. Ring 076-300 07 23 om något är bråttom.)`;
/** English when the reply is written in English (the AI answers in the customer's language). */
export const replyLang = (text: string): "sv" | "en" => (/\b(best regards|kind regards|thank you|we can help)\b/i.test(text) && !/vänliga hälsningar/i.test(text) ? "en" : "sv");

/** The language a customer wrote in: English or Swedish (a simple word count – good enough to pick the greeting). */
export function textLang(text: string): "sv" | "en" {
  const w = String(text || "").toLowerCase().match(/[a-zåäö]+/g) || [];
  const EN = new Set(["the", "and", "you", "my", "is", "was", "we", "have", "with", "please", "our", "your", "it", "to", "of", "hi", "hello", "thanks"]);
  const SV = new Set(["och", "jag", "att", "det", "är", "vi", "har", "med", "inte", "för", "en", "ett", "hej", "tack", "min", "mitt", "på", "som"]);
  let en = 0, sv = 0;
  for (const x of w) { if (EN.has(x)) en++; if (SV.has(x)) sv++; }
  return en > sv ? "en" : "sv";
}
