// "Lead-svarstid": warns the office when a request from the website has waited longer than the
// setting (slaMin, default 10 min) without anyone answering. Each request is warned about once.
// Runs at most once a minute, triggered by traffic that already happens: the admin page and the
// crew app refreshing, visitors on the website, and /api/cron/sla (for an outside cron service).
import { kv } from "./kv.ts";
import { listBookings, saveBooking } from "./store.ts";
import { getSettings } from "./settings.ts";
import { notifyAll } from "./push.ts";

export async function slaCheck(force = false): Promise<number> {
  if (!force && !(await kv(["SET", "fx:sla:tick", "1", "NX", "EX", 60]))) return 0;
  const s = await getSettings();
  if (!s.slaMin) return 0;
  const now = Date.now(), limit = s.slaMin * 60_000;
  const late = (await listBookings(300)).filter((b) => b.status === "new" && b.source === "web" && !b.firstResponseAt && !b.slaAlertedAt
    && now - b.createdAt >= limit && now - b.createdAt < 24 * 36e5);
  for (const b of late) {
    b.slaAlertedAt = now;
    await saveBooking(b);
    const min = Math.round((now - b.createdAt) / 60_000);
    await notifyAll({ cat: "sla", title: `⏰ Ingen har svarat ${b.data.name}`, body: `Förfrågan har väntat ${min} min · ${b.data.phone || ""}`.trim(), url: "/admin#" + b.id, tag: "sla-" + b.id });
  }
  return late.length;
}
// Called from busy routes; never lets a problem here break the request.
export const slaTick = () => slaCheck().catch(() => 0);
