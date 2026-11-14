// What the crew records on the job sheet: start/finish, photos and the customer's sign-off.
// Photos live in their own Redis list (fx:wp:<booking id>) so several phones can upload at once
// without overwriting each other; start/finish/sign-off are fields on the booking (b.work).
import { kv } from "./kv.ts";

export type PhotoKind = "before" | "after" | "damage";
export const PHOTO_KINDS: Record<PhotoKind, string> = { before: "Före", after: "Efter", damage: "Skada" };
export type Photo = { url: string; kind: PhotoKind; at: number };
export type Work = {
  startedAt?: number;
  finishedAt?: number;
  sign?: { name: string; at: number; img: string; note: string; ip: string };
};
export const MAX_PHOTOS = 60;
const K = (id: string) => `fx:wp:${id}`;

export async function listPhotos(id: string): Promise<Photo[]> {
  const l = await kv<string[]>(["LRANGE", K(id), 0, -1]);
  return (l || []).map((s) => JSON.parse(s) as Photo);
}
export async function countPhotos(id: string) { return Number(await kv(["LLEN", K(id)])) || 0; }
export async function addPhoto(id: string, p: Photo) { await kv(["RPUSH", K(id), JSON.stringify(p)]); }
export async function removePhoto(id: string, url: string): Promise<boolean> {
  const p = (await listPhotos(id)).find((x) => x.url === url);
  if (!p) return false;
  await kv(["LREM", K(id), 1, JSON.stringify(p)]);
  return true;
}

// Hours actually worked, when the crew pressed start and finish.
export const workedHours = (w?: Work) => (w?.startedAt && w.finishedAt && w.finishedAt > w.startedAt ? (w.finishedAt - w.startedAt) / 36e5 : null);
