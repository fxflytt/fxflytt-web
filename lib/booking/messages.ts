// Messages from the office to the people who go out on jobs (crew app), with "read by".
// One JSON list in Upstash: fx:msgs – the 200 newest are kept.
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type Msg = { id: string; text: string; from: string; at: number; to: "all" | string[]; read: Record<string, number> };
const KEY = "fx:msgs";

export async function listMsgs(): Promise<Msg[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Msg[]) : [];
}
const saveAll = (l: Msg[]) => kv(["SET", KEY, JSON.stringify(l.slice(0, 200))]);

export const isFor = (m: Msg, rid: string) => m.to === "all" || m.to.includes(rid);

export async function postMsg(text: unknown, to: unknown, from: string): Promise<Msg> {
  const t = typeof text === "string" ? text.trim().slice(0, 2000) : "";
  if (t.length < 2) throw new Error("Skriv ett meddelande.");
  const rcpt = to === "all" ? "all" : Array.isArray(to) ? [...new Set(to.filter((x): x is string => typeof x === "string" && /^R[0-9A-F]{8}$/.test(x)))] : [];
  if (rcpt !== "all" && !rcpt.length) throw new Error("Välj vem som ska få meddelandet.");
  const m: Msg = { id: "M" + randomBytes(5).toString("hex"), text: t, from, at: Date.now(), to: rcpt, read: {} };
  await saveAll([m, ...(await listMsgs())]);
  return m;
}

export async function markRead(ids: string[], rid: string): Promise<number> {
  const l = await listMsgs(); let n = 0;
  for (const m of l) if (ids.includes(m.id) && isFor(m, rid) && !m.read[rid]) { m.read[rid] = Date.now(); n++; }
  if (n) await saveAll(l);
  return n;
}

export async function deleteMsg(id: string) { await saveAll((await listMsgs()).filter((m) => m.id !== id)); }
