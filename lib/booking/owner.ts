// The owner's login: an e-mail address (one of the owner's addresses) + the owner password.
//   fx:owner  { emails: [...], salt?, hash?, sv }
// emails – who may log in as owner. Default: OWNER_EMAILS in Vercel (comma separated), else info@fxflytt.se.
// The password is ADMIN_PASSWORD in Vercel until the owner sets an own one in the admin (then it is
// stored hashed here). Changing it bumps sv, which logs the owner out on every other device.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { kv, kvConfigured } from "./kv.ts";
import { passwordOk } from "./auth.ts";
import { checkPassword } from "./users.ts";

export type OwnerLogin = { emails: string[]; salt?: string; hash?: string; sv: number };
const KEY = "fx:owner";
const EMAIL = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;
const hashPw = (pw: string, salt: string) => scryptSync(pw, salt, 32).toString("hex");
const defaults = (): string[] => (process.env.OWNER_EMAILS || "info@fxflytt.se").split(",").map((e) => e.trim().toLowerCase()).filter((e) => EMAIL.test(e));

export async function getOwner(): Promise<OwnerLogin> {
  const s = kvConfigured() ? await kv<string | null>(["GET", KEY]) : null;
  const o = s ? (JSON.parse(s) as OwnerLogin) : { emails: [], sv: 0 };
  if (!o.emails?.length) o.emails = defaults();
  o.sv ||= 0;
  return o;
}

function pwMatches(o: OwnerLogin, pw: unknown): boolean {
  if (typeof pw !== "string") return false;
  if (!o.hash || !o.salt) return passwordOk(pw);
  return timingSafeEqual(Buffer.from(hashPw(pw, o.salt), "hex"), Buffer.from(o.hash, "hex"));
}

// Returns the owner's session version when e-mail + password are right, else null.
export async function ownerLogin(email: unknown, pw: unknown): Promise<number | null> {
  const o = await getOwner(), e = typeof email === "string" ? email.trim().toLowerCase() : "";
  const ok = pwMatches(o, pw);                         // always do the work, whatever the e-mail
  return ok && o.emails.includes(e) ? o.sv : null;
}

export async function updateOwner(d: { emails?: unknown; password?: unknown; current?: unknown }): Promise<{ emails: string[]; ownPassword: boolean; sv: number }> {
  const o = await getOwner();
  if (Array.isArray(d.emails)) {
    const list = [...new Set(d.emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean))];
    const bad = list.find((e) => !EMAIL.test(e));
    if (bad) throw new Error(`"${bad}" ser inte ut som en e-postadress.`);
    if (!list.length) throw new Error("Minst en e-postadress behövs – annars kan ingen logga in som ägare.");
    if (list.length > 5) throw new Error("Högst 5 adresser.");
    o.emails = list;
  }
  if (d.password !== undefined) {
    if (!pwMatches(o, d.current)) throw new Error("Nuvarande lösenord stämmer inte.");
    const bad = checkPassword(d.password); if (bad) throw new Error(bad);
    o.salt = randomBytes(16).toString("hex"); o.hash = hashPw(d.password as string, o.salt); o.sv++;
  }
  await kv(["SET", KEY, JSON.stringify(o)]);
  return { emails: o.emails, ownPassword: !!o.hash, sv: o.sv };
}
