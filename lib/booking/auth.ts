// Admin login.
//   Owner:  the one password in the Vercel environment (ADMIN_PASSWORD). Always works, always full access.
//   Staff:  accounts the owner creates in Inställningar → Användare (lib/booking/users.ts), role "owner" or "office".
// The session is a signed cookie: expiry, user id and the user's session version. Changing ADMIN_PASSWORD logs
// everyone out; changing a user's password or deactivating them logs out that user.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { getUser, type Role } from "./users.ts";

const COOKIE = "fx_admin";
const DAYS = 30;

const key = () => {
  const p = process.env.ADMIN_PASSWORD;
  return p ? createHash("sha256").update("fx-admin-v2|" + p).digest() : null;
};
const sign = (payload: string, k: Buffer) => createHmac("sha256", k).update(payload).digest("base64url");
const same = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
};

export const adminConfigured = () => Boolean(process.env.ADMIN_PASSWORD);

export function passwordOk(given: unknown): boolean {
  const p = process.env.ADMIN_PASSWORD;
  if (!p || typeof given !== "string") return false;
  const a = createHash("sha256").update(given).digest(), b = createHash("sha256").update(p).digest();
  return timingSafeEqual(a, b);
}

export function sessionCookie(uid = "owner", sv = 0): string {
  const k = key()!;
  const exp = Date.now() + DAYS * 864e5;
  const payload = `${exp}.${uid}.${sv}`;
  return `${COOKIE}=${payload}.${sign(payload, k)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

// Signature and expiry only (no storage lookup).
export function readSession(req: Request): { uid: string; sv: number } | null {
  const k = key();
  if (!k) return null;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const parts = m[1].split(".");
  if (parts.length !== 4) return null;
  const [exp, uid, sv, mac] = parts;
  if (!(Number(exp) > Date.now()) || !/^(owner|U[0-9A-F]{8})$/.test(uid)) return null;
  return same(mac, sign(`${exp}.${uid}.${sv}`, k)) ? { uid, sv: Number(sv) } : null;
}

// Cheap check (no lookup) – used where a wrong answer only affects counters, e.g. offer views.
export const isAdmin = (req: Request) => readSession(req) !== null;

export type SessionUser = { id: string; name: string; role: Role };
export const OWNER: SessionUser = { id: "owner", name: "Ägaren", role: "owner" };

export async function currentUser(req: Request): Promise<SessionUser | null> {
  const s = readSession(req);
  if (!s) return null;
  if (s.uid === "owner") return OWNER;
  const u = await getUser(s.uid).catch(() => null);
  return u && u.active && u.sv === s.sv ? { id: u.id, name: u.name, role: u.role } : null;
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
export const forbidden = () => Response.json({ error: "Bara ägaren har tillgång till det här." }, { status: 403 });

// In a route: const u = await requireUser(req); if (u instanceof Response) return u;
export async function requireUser(req: Request, role?: Role): Promise<SessionUser | Response> {
  const u = await currentUser(req);
  if (!u) return unauthorized();
  if (role === "owner" && u.role !== "owner") return forbidden();
  return u;
}
