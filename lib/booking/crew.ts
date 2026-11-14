// The crew app (/jobb): people who go out on jobs log in with their mobile number and a 6-digit PIN.
// The owner makes the PIN in admin → Personal ("Bjud in till appen"); a new PIN logs the person out
// everywhere, archiving the person or "Stäng av appen" stops access at once.
// Session: signed cookie fx_crew = expiry.personId.sessionVersion.signature (90 days, separate from admin).
import { createHash, createHmac, randomInt, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { kv } from "./kv.ts";
import { listResources, type Resource } from "./team.ts";

const COOKIE = "fx_crew", DAYS = 90;
const key = () => { const p = process.env.ADMIN_PASSWORD; return p ? createHash("sha256").update("fx-crew-v1|" + p).digest() : null; };
const sign = (s: string, k: Buffer) => createHmac("sha256", k).update(s).digest("base64url");
const hash = (pin: string, salt: string) => scryptSync(pin, salt, 32).toString("hex");
export const phoneKey = (p: unknown) => String(p ?? "").replace(/\D/g, "").replace(/^46/, "0").replace(/^(?!0)/, "0");

async function saveAll(list: Resource[]) { await kv(["SET", "fx:res", JSON.stringify(list)]); }

// Owner: make a new PIN for a person (shown once). Logs the person out on all phones.
export async function invite(id: string): Promise<{ pin: string; person: Resource }> {
  const list = await listResources(), r = list.find((x) => x.id === id);
  if (!r || r.kind !== "person") throw new Error("Personen finns inte.");
  if (!r.active) throw new Error("Personen är arkiverad.");
  const pk = phoneKey(r.phone);
  if (pk.length < 8) throw new Error("Lägg in personens mobilnummer först – det är det hen loggar in med.");
  const dup = list.find((x) => x.id !== r.id && x.kind === "person" && x.active && x.pinHash && phoneKey(x.phone) === pk);
  if (dup) throw new Error(`${dup.name} har redan appen med samma mobilnummer.`);
  const pin = String(randomInt(0, 1_000_000)).padStart(6, "0");
  r.pinSalt = randomBytes(16).toString("hex"); r.pinHash = hash(pin, r.pinSalt); r.sv = (r.sv || 0) + 1; r.appAt = Date.now();
  await saveAll(list);
  return { pin, person: r };
}

export async function disable(id: string): Promise<void> {
  const list = await listResources(), r = list.find((x) => x.id === id);
  if (!r) throw new Error("Personen finns inte.");
  delete r.pinHash; delete r.pinSalt; r.sv = (r.sv || 0) + 1;
  await saveAll(list);
}

// Login. Wrong PINs are counted per number in Upstash: after 8 wrong in 15 minutes the number is locked for 15 minutes.
export async function login(phone: unknown, pin: unknown): Promise<{ person: Resource } | { error: string }> {
  const pk = phoneKey(phone), lockKey = "fx:crewfail:" + pk;
  if (pk.length < 8) return { error: "Skriv ditt mobilnummer." };
  const fails = Number(await kv(["GET", lockKey])) || 0;
  if (fails >= 8) return { error: "För många fel försök. Vänta 15 minuter eller ring kontoret." };
  const list = await listResources();
  const r = list.find((x) => x.kind === "person" && x.active && x.pinHash && phoneKey(x.phone) === pk);
  const given = typeof pin === "string" ? pin.replace(/\s/g, "") : "";
  const want = Buffer.from(r?.pinHash || "0".repeat(64), "hex");
  const got = Buffer.from(hash(given, r?.pinSalt || "0".repeat(32)), "hex");   // same work whether or not the number exists
  if (!r || !/^\d{6}$/.test(given) || !timingSafeEqual(got, want)) {
    await kv(["INCR", lockKey]); await kv(["EXPIRE", lockKey, 900]);
    return { error: "Fel mobilnummer eller kod." };
  }
  await kv(["DEL", lockKey]);
  r.lastSeenAt = Date.now(); await saveAll(list);
  return { person: r };
}

export function crewCookie(r: Resource): string {
  const k = key()!, exp = Date.now() + DAYS * 864e5, payload = `${exp}.${r.id}.${r.sv || 0}`;
  return `${COOKIE}=${payload}.${sign(payload, k)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${DAYS * 86400}`;
}
export const clearCrewCookie = () => `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;

// The logged-in person, or null (expired, wrong signature, new PIN, app turned off, archived).
export async function crewUser(req: Request): Promise<Resource | null> {
  const k = key(); if (!k) return null;
  const m = (req.headers.get("cookie") || "").match(new RegExp(`(?:^|;\\s*)${COOKIE}=([^;]+)`));
  if (!m) return null;
  const [exp, id, sv, mac] = m[1].split(".");
  if (!mac || !(Number(exp) > Date.now()) || !/^R[0-9A-F]{8}$/.test(id)) return null;
  const want = sign(`${exp}.${id}.${sv}`, k);
  if (want.length !== mac.length || !timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  const r = (await listResources()).find((x) => x.id === id);
  return r && r.active && r.kind === "person" && r.pinHash && (r.sv || 0) === Number(sv) ? r : null;
}
