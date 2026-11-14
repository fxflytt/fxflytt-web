// Staff and vehicles, stored in Upstash Redis as one small JSON list:
//   fx:res   [Resource, …]
// Removing someone archives them (active: false) so old bookings still show who did the job.
import { randomBytes } from "node:crypto";
import { kv } from "./kv.ts";

export type ResourceKind = "person" | "vehicle";
export type Resource = {
  id: string;
  kind: ResourceKind;
  name: string;           // "Ahmad", "Lastbil 1 – ABC123"
  phone?: string;         // person
  role?: string;          // person: "Flyttledare", "Flyttare", "Städare"; vehicle: "Lastbil 20 m³"
  note?: string;
  color: string;
  active: boolean;
  createdAt: number;
};

export const COLORS = ["#2f6fb2", "#1f8a4c", "#c2560a", "#a2479b", "#0f8a8a", "#b42318", "#5a52c7", "#8a6d1f", "#3d5a6c", "#d6457a"];
const KEY = "fx:res";
const MAX = 80;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");

export async function listResources(): Promise<Resource[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as Resource[]) : [];
}

async function saveAll(list: Resource[]) {
  await kv(["SET", KEY, JSON.stringify(list)]);
}

// Validates admin input; returns the clean fields or an error message.
export function cleanResource(d: Record<string, unknown>, partial = false): { ok: Partial<Resource> } | { error: string } {
  const out: Partial<Resource> = {};
  if (!partial || "kind" in d) {
    if (d.kind !== "person" && d.kind !== "vehicle") return { error: "Välj person eller fordon." };
    out.kind = d.kind;
  }
  if (!partial || "name" in d) {
    const name = str(d.name, 60);
    if (!name) return { error: "Namn behövs." };
    out.name = name;
  }
  if ("phone" in d) out.phone = str(d.phone, 30);
  if ("role" in d) out.role = str(d.role, 40);
  if ("note" in d) out.note = str(d.note, 300);
  if ("color" in d) { const c = str(d.color, 7); if (/^#[0-9a-f]{6}$/i.test(c)) out.color = c.toLowerCase(); }
  if ("active" in d) out.active = d.active !== false;
  return { ok: out };
}

export async function addResource(fields: Partial<Resource>): Promise<Resource> {
  const list = await listResources();
  if (list.length >= MAX) throw new Error("Max " + MAX + " personer och fordon.");
  const used = new Set(list.filter((r) => r.active).map((r) => r.color));
  const r: Resource = {
    id: "R" + randomBytes(4).toString("hex").toUpperCase(),
    kind: fields.kind!, name: fields.name!, phone: fields.phone || "", role: fields.role || "", note: fields.note || "",
    color: fields.color || COLORS.find((c) => !used.has(c)) || COLORS[list.length % COLORS.length],
    active: true, createdAt: Date.now(),
  };
  list.push(r);
  await saveAll(list);
  return r;
}

export async function updateResource(id: string, fields: Partial<Resource>): Promise<Resource | null> {
  const list = await listResources();
  const r = list.find((x) => x.id === id);
  if (!r) return null;
  delete fields.id; delete fields.createdAt;
  Object.assign(r, fields);
  await saveAll(list);
  return r;
}
