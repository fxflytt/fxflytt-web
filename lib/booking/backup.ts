// Backups of everything the booking system keeps in Upstash (keys fx:*): bookings, links, staff,
// users, settings, prices, photo lists. Not the photos themselves (they are in Vercel Blob) and not the
// temporary photo fallback (fx:ph:*).
//   dump()          → a plain object (also what the owner downloads, gzipped)
//   restoreMissing  → puts back only what is missing; never overwrites something that exists
//   Daily copies go to Vercel Blob, gzipped and encrypted with a key made from ADMIN_PASSWORD, 30 kept.
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { put, list, del } from "@vercel/blob";
import { kv, kvPipe } from "./kv.ts";
import { blobConfigured } from "./photos.ts";

export type Dump = { format: "fx-backup-1"; createdAt: number; keys: Record<string, { t: "s" | "z" | "l"; v: unknown }> };
const SKIP = (k: string) => k.startsWith("fx:ph:");
const PREFIX = "fx-backup/";
const KEEP = 30;

async function allKeys(): Promise<string[]> {
  const keys: string[] = [];
  let cursor = "0";
  do {
    const [next, batch] = await kv<[string, string[]]>(["SCAN", cursor, "MATCH", "fx:*", "COUNT", 1000]);
    keys.push(...batch.filter((k) => !SKIP(k)));
    cursor = String(next);
  } while (cursor !== "0");
  return [...new Set(keys)].sort();
}

export async function dump(): Promise<Dump> {
  const keys = await allKeys(), out: Dump = { format: "fx-backup-1", createdAt: Date.now(), keys: {} };
  for (let i = 0; i < keys.length; i += 200) {
    const part = keys.slice(i, i + 200);
    const types = (await kvPipe(part.map((k) => ["TYPE", k]))) as string[];
    const cmds = part.map((k, j) => types[j] === "zset" ? ["ZRANGE", k, 0, -1, "WITHSCORES"] : types[j] === "list" ? ["LRANGE", k, 0, -1] : ["GET", k]);
    const vals = await kvPipe(cmds);
    part.forEach((k, j) => {
      if (types[j] === "zset") {
        const flat = vals[j] as string[], pairs: [string, number][] = [];
        for (let x = 0; x < flat.length; x += 2) pairs.push([flat[x], Number(flat[x + 1])]);
        out.keys[k] = { t: "z", v: pairs };
      } else if (types[j] === "list") out.keys[k] = { t: "l", v: vals[j] };
      else if (types[j] === "string") out.keys[k] = { t: "s", v: vals[j] };
    });
  }
  return out;
}

// Puts back keys that are missing, and adds missing members to the booking indexes. Returns counts.
export async function restoreMissing(d: Dump): Promise<{ keys: number; bookings: number; index: number }> {
  if (!d || d.format !== "fx-backup-1" || typeof d.keys !== "object") throw new Error("Filen är inte en säkerhetskopia från FX Flytt.");
  const names = Object.keys(d.keys).filter((k) => k.startsWith("fx:") && !SKIP(k));
  let keys = 0, bookings = 0, index = 0;
  for (let i = 0; i < names.length; i += 200) {
    const part = names.slice(i, i + 200);
    const exists = (await kvPipe(part.map((k) => ["EXISTS", k]))) as number[];
    const cmds: (string | number)[][] = [];
    part.forEach((k, j) => {
      const { t, v } = d.keys[k];
      if (t === "z") {   // indexes: add the members that are missing, keep the ones there
        const pairs = (v as [string, number][]).filter((p) => Array.isArray(p) && typeof p[0] === "string");
        if (pairs.length) { cmds.push(["ZADD", k, "NX", ...pairs.flatMap(([m, s]) => [s, m])]); index += exists[j] ? 0 : 1; }
        if (!exists[j]) keys++;
        return;
      }
      if (exists[j]) return;
      if (t === "s" && typeof v === "string") { cmds.push(["SET", k, v]); keys++; if (k.startsWith("fx:b:")) bookings++; }
      else if (t === "l" && Array.isArray(v) && v.length) { cmds.push(["RPUSH", k, ...(v as string[])]); keys++; }
    });
    if (cmds.length) await kvPipe(cmds);
  }
  return { keys, bookings, index };
}

// ---- file format: gzip, optionally encrypted (AES-256-GCM) for copies stored outside the owner's computer
const key = () => {
  const p = process.env.ADMIN_PASSWORD;
  if (!p) throw new Error("ADMIN_PASSWORD saknas.");
  return createHash("sha256").update("fx-backup-v1|" + p).digest();
};
export const pack = (d: Dump) => gzipSync(Buffer.from(JSON.stringify(d)));
export function encrypt(gz: Buffer): Buffer {
  const iv = randomBytes(12), c = createCipheriv("aes-256-gcm", key(), iv);
  const body = Buffer.concat([c.update(gz), c.final()]);
  return Buffer.concat([Buffer.from("FXB1"), iv, c.getAuthTag(), body]);
}
// Reads a backup file: encrypted (FXB1…), gzipped or plain JSON.
export function unpack(buf: Buffer): Dump {
  if (buf.subarray(0, 4).toString() === "FXB1") {
    const d = createDecipheriv("aes-256-gcm", key(), buf.subarray(4, 16));
    d.setAuthTag(buf.subarray(16, 32));
    try { buf = Buffer.concat([d.update(buf.subarray(32)), d.final()]); }
    catch { throw new Error("Kunde inte läsa kopian – den gjordes med ett annat ägarlösenord (ADMIN_PASSWORD)."); }
  }
  if (buf[0] === 0x1f && buf[1] === 0x8b) buf = gunzipSync(buf);
  try { return JSON.parse(buf.toString("utf8")) as Dump; } catch { throw new Error("Filen är inte en säkerhetskopia från FX Flytt."); }
}

// ---- daily copies in Vercel Blob
export type Stored = { pathname: string; url: string; size: number; uploadedAt: string };
export async function storedBackups(): Promise<Stored[]> {
  if (!blobConfigured()) return [];
  const r = await list({ prefix: PREFIX, limit: 1000 });
  return r.blobs.map((b) => ({ pathname: b.pathname, url: b.url, size: b.size, uploadedAt: new Date(b.uploadedAt).toISOString() }))
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

export async function storeBackup(): Promise<Stored> {
  if (!blobConfigured()) throw new Error("Vercel Blob är inte kopplat – automatiska kopior kan inte sparas.");
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  const r = await put(`${PREFIX}${day}.fxb`, encrypt(pack(await dump())), { access: "public", contentType: "application/octet-stream", addRandomSuffix: true });
  const all = await storedBackups();
  const old = all.slice(KEEP);
  if (old.length) await del(old.map((b) => b.url));
  return all.find((b) => b.url === r.url) || { pathname: r.pathname, url: r.url, size: 0, uploadedAt: new Date().toISOString() };
}

// Once a day from the daily job: only if today's copy is not there yet.
export async function dailyBackup(): Promise<string> {
  if (!blobConfigured()) return "blob saknas";
  const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
  if ((await storedBackups()).some((b) => b.pathname.startsWith(PREFIX + day))) return "finns redan";
  const b = await storeBackup();
  return "sparad " + b.pathname;
}

export async function readStored(pathname: string): Promise<Dump> {
  const b = (await storedBackups()).find((x) => x.pathname === pathname);
  if (!b) throw new Error("Kopian finns inte.");
  const r = await fetch(b.url, { cache: "no-store" });
  if (!r.ok) throw new Error("Kunde inte hämta kopian.");
  return unpack(Buffer.from(await r.arrayBuffer()));
}

// Bookings as a spreadsheet (Swedish Excel: semicolons, BOM).
export function bookingsCsv(d: Dump): string {
  const q = (s: unknown) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const crew = new Map<string, string>();
  const res = d.keys["fx:res"]?.v;
  if (typeof res === "string") for (const r of JSON.parse(res) as { id: string; name: string }[]) crew.set(r.id, r.name);
  const rows = [["Bokning", "Skapad", "Status", "Namn", "Telefon", "E-post", "Från", "Till", "Tjänst", "Boyta m²", "Flyttdatum", "Starttid", "Pris efter RUT", "Personal", "Källa"]];
  const list = Object.entries(d.keys).filter(([k, x]) => k.startsWith("fx:b:") && x.t === "s").map(([, x]) => JSON.parse(x.v as string))
    .sort((a, b) => b.createdAt - a.createdAt);
  for (const b of list) rows.push([b.id, new Date(b.createdAt).toISOString().slice(0, 10), b.status, b.data?.name, b.data?.phone, b.data?.email, b.data?.from, b.data?.to,
    b.data?.size, b.data?.areaM2, b.date || "", b.time || "", b.offer?.total ?? "", (b.crew || []).map((id: string) => crew.get(id) || id).join(", "), b.source === "web" ? "Hemsidan" : "Manuell"]);
  return "﻿" + rows.map((r) => r.map(q).join(";")).join("\r\n");
}
