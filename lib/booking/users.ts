// Staff accounts for the admin page, stored in Upstash Redis as one small JSON list:  fx:users  [User, …]
// Passwords are hashed with scrypt. Roles:
//   owner  – everything
//   office – bookings, offers, calendar, staff, job sheets; not money reports, statistics, prices or accounts
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { kv } from "./kv.ts";

export type Role = "owner" | "office";
export const ROLES: Role[] = ["owner", "office"];
export type User = {
  id: string; name: string; username: string; role: Role; active: boolean;
  salt: string; hash: string; sv: number;          // sv = session version: bumped to log the user out everywhere
  createdAt: number; lastLoginAt?: number;
};
export type PublicUser = Omit<User, "salt" | "hash" | "sv">;

const KEY = "fx:users", MAX = 30;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max).trim() : "");
const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString("hex");
export const publicUser = ({ salt, hash, sv, ...u }: User): PublicUser => u;

export async function listUsers(): Promise<User[]> {
  const s = await kv<string | null>(["GET", KEY]);
  return s ? (JSON.parse(s) as User[]) : [];
}
const saveAll = (l: User[]) => kv(["SET", KEY, JSON.stringify(l)]);
export async function getUser(id: string) { return (await listUsers()).find((u) => u.id === id) || null; }

export function checkPassword(pw: unknown): string {
  if (typeof pw !== "string" || pw.length < 8) return "Lösenordet måste ha minst 8 tecken.";
  if (pw.length > 200) return "För långt lösenord.";
  return "";
}

export async function createUser(d: Record<string, unknown>): Promise<PublicUser> {
  const name = str(d.name, 60), username = str(d.username, 40).toLowerCase(), role = d.role as Role;
  if (!name) throw new Error("Namn behövs.");
  if (!/^[a-z0-9._-]{3,40}$/.test(username)) throw new Error("Användarnamn: 3–40 tecken, a–z, siffror, punkt, bindestreck.");
  if (!ROLES.includes(role)) throw new Error("Välj roll.");
  const bad = checkPassword(d.password); if (bad) throw new Error(bad);
  const list = await listUsers();
  if (list.length >= MAX) throw new Error("Max " + MAX + " användare.");
  if (list.some((u) => u.username === username)) throw new Error("Användarnamnet finns redan.");
  const salt = randomBytes(16).toString("hex");
  const u: User = { id: "U" + randomBytes(4).toString("hex").toUpperCase(), name, username, role, active: true, salt, hash: hashPw(d.password as string, salt), sv: 0, createdAt: Date.now() };
  list.push(u); await saveAll(list);
  return publicUser(u);
}

export async function updateUser(id: string, d: Record<string, unknown>): Promise<PublicUser | null> {
  const list = await listUsers(), u = list.find((x) => x.id === id);
  if (!u) return null;
  if ("name" in d) { const n = str(d.name, 60); if (!n) throw new Error("Namn behövs."); u.name = n; }
  if ("role" in d) { if (!ROLES.includes(d.role as Role)) throw new Error("Välj roll."); if (d.role !== u.role) { u.role = d.role as Role; u.sv++; } }
  if ("active" in d) { const a = d.active !== false; if (a !== u.active) { u.active = a; u.sv++; } }
  if ("password" in d) { const bad = checkPassword(d.password); if (bad) throw new Error(bad); u.salt = randomBytes(16).toString("hex"); u.hash = hashPw(d.password as string, u.salt); u.sv++; }
  await saveAll(list);
  return publicUser(u);
}

// Returns the user when username + password match an active account.
export async function verifyLogin(username: unknown, pw: unknown): Promise<User | null> {
  const list = await listUsers(), name = str(username, 40).toLowerCase();
  const u = list.find((x) => x.username === name);
  const salt = u?.salt || "0".repeat(32), want = Buffer.from(u?.hash || "0".repeat(64), "hex");
  const got = Buffer.from(hashPw(typeof pw === "string" ? pw : "", salt), "hex");   // same work whether or not the user exists
  if (!u || !u.active || !timingSafeEqual(got, want)) return null;
  u.lastLoginAt = Date.now(); await saveAll(list);
  return u;
}
