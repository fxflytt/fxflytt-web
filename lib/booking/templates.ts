// Offer templates ("Offertmallar"): a ready offer for jobs that come back often – piano move, office
// move, a fixed cleaning – picked in "Ny offert" instead of typing the lines and the text each time.
//   fx:tpl  [Template, …]
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type Template = { id: string; name: string; size: string; total: number; lines: { label: string; amount: number }[]; customerNote: string; by: string; at: number };
const KEY = "fx:tpl", MAX = 40;
const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");

export async function listTemplates(): Promise<Template[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Template[]) : [];
}
export async function saveTemplate(d: Record<string, unknown>, by: string): Promise<Template> {
  const name = str(d.name, 60);
  if (!name) throw new Error("Ge mallen ett namn.");
  const lines = Array.isArray(d.lines) ? d.lines.slice(0, 15).map((l) => ({ label: str((l as Record<string, unknown>)?.label, 120), amount: Math.round(Number((l as Record<string, unknown>)?.amount) || 0) })).filter((l) => l.label) : [];
  const total = Math.round(Number(d.total) || lines.reduce((a, l) => a + l.amount, 0));
  if (!(total > 0)) throw new Error("Mallen behöver ett pris.");
  const list = await listTemplates();
  const old = list.find((t) => t.name.toLowerCase() === name.toLowerCase());
  const t: Template = { id: old?.id || "T" + randomBytes(4).toString("hex"), name, size: str(d.size, 80), total, lines, customerNote: str(d.customerNote, 500), by, at: Date.now() };
  const rest = list.filter((x) => x.id !== t.id);
  if (!old && rest.length >= MAX) throw new Error(`Högst ${MAX} mallar.`);
  await kv(["SET", KEY, JSON.stringify([...rest, t].sort((a, b) => a.name.localeCompare(b.name, "sv")))]);
  return t;
}
export async function deleteTemplate(id: string) {
  await kv(["SET", KEY, JSON.stringify((await listTemplates()).filter((t) => t.id !== id))]);
}
