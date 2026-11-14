// Owner only: backups.
//   GET                     { blob, backups: daily copies in Vercel Blob (newest first) }
//   GET ?file=now           download a full copy now (.json.gz)
//   GET ?file=excel         all bookings as a spreadsheet (.csv)
//   GET ?file=<pathname>    download one of the daily copies (decrypted, .json.gz)
//   POST ?do=run            make today's copy in Vercel Blob now
//   POST ?do=restore&from=<pathname>   put back what is missing, from a daily copy
//   POST ?do=restore        body = a downloaded copy (.json.gz or .json) – put back what is missing
import { requireUser } from "@/lib/booking/auth.ts";
import { kvConfigured } from "@/lib/booking/kv.ts";
import { blobConfigured } from "@/lib/booking/photos.ts";
import { dump, pack, unpack, restoreMissing, storedBackups, storeBackup, readStored, bookingsCsv } from "@/lib/booking/backup.ts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;
const err = (error: string, status = 400) => Response.json({ error }, { status });
const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });

export async function GET(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const file = new URL(req.url).searchParams.get("file");
  try {
    if (!file) return Response.json({ blob: blobConfigured(), backups: await storedBackups() });
    if (file === "excel") return new Response(bookingsCsv(await dump()), { headers: {
      "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="fxflytt-bokningar-${today()}.csv"` } });
    const d = file === "now" ? await dump() : await readStored(file);
    const day = new Date(d.createdAt).toLocaleDateString("sv-SE", { timeZone: "Europe/Stockholm" });
    return new Response(new Uint8Array(pack(d)), { headers: {
      "Content-Type": "application/gzip", "Content-Disposition": `attachment; filename="fxflytt-sakerhetskopia-${day}.json.gz"`, "Cache-Control": "no-store" } });
  } catch (e) { return err((e as Error).message); }
}

export async function POST(req: Request) {
  const u = await requireUser(req, "owner"); if (u instanceof Response) return u;
  if (!kvConfigured()) return err("Lagring saknas.", 503);
  const q = new URL(req.url).searchParams;
  try {
    if (q.get("do") === "run") return Response.json({ ok: true, backup: await storeBackup() });
    if (q.get("do") === "restore") {
      const from = q.get("from");
      const d = from ? await readStored(from) : unpack(Buffer.from(await req.arrayBuffer()));
      return Response.json({ ok: true, ...(await restoreMissing(d)), createdAt: d.createdAt });
    }
  } catch (e) { return err((e as Error).message); }
  return err("Okänd åtgärd.");
}
