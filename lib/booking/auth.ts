// Admin login: one password in the Vercel environment (ADMIN_PASSWORD, set by the owner),
// and a signed cookie. Changing the password logs everyone out.
import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const COOKIE = "fx_admin";
const DAYS = 30;

const key = () => {
  const p = process.env.ADMIN_PASSWORD;
  return p ? createHash("sha256").update("fx-admin-v1|" + p).digest() : null;
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

export function sessionCookie(): string {
  const k = key()!;
  const exp = Date.now() + DAYS * 864e5;
  const v = `${exp}.${sign(String(exp), k)}`;
  return `${COOKIE}=${v}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${DAYS * 86400}`;
}
export const clearCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;

export function isAdmin(req: Request): boolean {
  const k = key();
  if (!k) return false;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return false;
  const [exp, mac] = m[1].split(".");
  if (!exp || !mac || !(Number(exp) > Date.now())) return false;
  return same(mac, sign(exp, k));
}

export const unauthorized = () => Response.json({ error: "unauthorized" }, { status: 401 });
