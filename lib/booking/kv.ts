// Tiny client for Upstash Redis over its REST API (added from Vercel → Storage → Upstash Redis).
// Reads KV_REST_API_URL / KV_REST_API_TOKEN (Vercel's names) or UPSTASH_REDIS_REST_URL / _TOKEN.
// No dependencies: plain fetch.
type Cmd = (string | number)[];

function conf() {
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url: url.replace(/\/$/, ""), token } : null;
}

export const kvConfigured = () => conf() !== null;

export async function kv<T = unknown>(cmd: Cmd): Promise<T> {
  const c = conf();
  if (!c) throw new Error("kv-not-configured");
  const r = await fetch(c.url, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmd.map(String)),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => ({}))) as { result?: T; error?: string };
  if (!r.ok || j.error) throw new Error("kv: " + (j.error || r.status));
  return j.result as T;
}

export async function kvPipe(cmds: Cmd[]): Promise<unknown[]> {
  const c = conf();
  if (!c) throw new Error("kv-not-configured");
  if (!cmds.length) return [];
  const r = await fetch(c.url + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds.map((x) => x.map(String))),
    cache: "no-store",
  });
  const j = (await r.json().catch(() => [])) as { result?: unknown; error?: string }[];
  if (!r.ok || !Array.isArray(j)) throw new Error("kv pipeline: " + r.status);
  const bad = j.find((x) => x.error);
  if (bad) throw new Error("kv: " + bad.error);
  return j.map((x) => x.result);
}
