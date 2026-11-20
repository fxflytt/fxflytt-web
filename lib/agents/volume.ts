// Extra things a customer wants to add to an offer or booking ("jag har 70 kartonger", "vi tar med en soffa till"):
// how much room they take, and whether we can take them without changing the price. The owner's rule (2026-11-20):
//   - small additions are free: up to 2 m³ extra, AS LONG AS they still fit in the trucks the price is based on;
//   - if the booking is already full (e.g. 20 m³ on one 20 m³ truck), even a little extra is not promised free;
//   - anything else: promise nothing – the office checks the volume and tells the customer if the price changes.
// Volumes per item are the website's cubic calculator figures (lib/assistant/volumes.json, from site-src/kubik.js).
import VOL from "../assistant/volumes.json" with { type: "json" };
import type { Booking } from "../booking/store.ts";

export const FREE_EXTRA_M3 = 2;
export const VOLUMES = VOL as unknown as Record<string, [string, number]>;
export const M3_PER_M2 = 0.33;            // the rule of thumb on the website: 60 m² ≈ 20 m³
export type AddItem = { id: string; qty: number; label?: string; m3?: number };

const r1 = (n: number) => Math.round(n * 10) / 10;
const sv = (n: number) => String(r1(n)).replace(".", ",");

/** m³ of the things the customer wants to add. Unknown things use the AI's own estimate (m3 per piece). */
export function itemsM3(items: AddItem[]): { m3: number; lines: string[] } {
  let m3 = 0; const lines: string[] = [];
  for (const it of items) {
    const qty = Math.max(1, Math.min(500, Math.round(Number(it.qty) || 1)));
    const v = VOLUMES[it.id];
    const per = v ? v[1] : Math.max(0, Math.min(10, Number(it.m3) || 0));
    if (!per) continue;
    m3 += per * qty;
    lines.push(`${qty} × ${v ? v[0] : it.label || "annat"} (${sv(per)} m³ st) = ${sv(per * qty)} m³`);
  }
  return { m3: r1(m3), lines };
}

/** The volume the booking's price is based on, and how many trucks (m³) that price includes. */
export function bookedRoom(b: Booking, truckM3 = 20): { m3: number | null; from: "list" | "area" | null; trucks: number | null; capacity: number | null } {
  const list = b.data.volume?.m3;
  const area = Number(b.data.areaM2) || 0;
  const m3 = list ? list : area ? r1(area * M3_PER_M2) : null;
  const lines = (b.offer?.lines || []).map((l) => l.label).join(" ");
  const t = lines.match(/\((\d+) flyttbil/);
  const trucks = t ? Number(t[1]) : m3 ? Math.max(1, Math.ceil(m3 / truckM3)) : null;
  return { m3, from: list ? "list" : area ? "area" : null, trucks, capacity: trucks ? trucks * truckM3 : null };
}

export type ExtraCheck = { add: number; lines: string[]; booked: number | null; capacity: number | null; free: boolean; reason: string };
export function extraCheck(b: Booking, items: AddItem[], truckM3 = 20): ExtraCheck | null {
  const { m3: add, lines } = itemsM3(items);
  if (!add) return null;
  const room = bookedRoom(b, truckM3);
  if (room.m3 == null || room.capacity == null) return { add, lines, booked: null, capacity: null, free: false, reason: "Bokningen saknar boyta/volym – kontoret får bedöma." };
  const fits = room.m3 + add <= room.capacity;
  const free = add <= FREE_EXTRA_M3 && fits;
  const reason = free ? `Ryms: ${sv(room.m3)} + ${sv(add)} m³ ≤ ${room.capacity} m³ i ${room.trucks} flyttbil${room.trucks! > 1 ? "ar" : ""}, och tillägget är högst ${FREE_EXTRA_M3} m³.`
    : add > FREE_EXTRA_M3 ? `Tillägget (${sv(add)} m³) är mer än ${FREE_EXTRA_M3} m³.`
    : `Bokningen är redan nästan full: ${sv(room.m3)} m³ ${room.from === "list" ? "enligt kundens lista" : "enligt boytan"} + ${sv(add)} m³ > ${room.capacity} m³ i ${room.trucks} flyttbil${room.trucks! > 1 ? "ar" : ""}.`;
  return { add, lines, booked: room.m3, capacity: room.capacity, free, reason };
}

/** What the reply may say about the addition. */
export function extraText(x: ExtraCheck): string {
  return [`TILLÄGG SOM KUNDEN VILL HA MED (räknat med kubikräknarens mått): ${x.lines.join("; ")} – totalt ca ${sv(x.add)} m³.`,
    x.booked != null ? `Bokningen/offerten bygger på ca ${sv(x.booked)} m³ och rymmer ${x.capacity} m³.` : "",
    x.free ? `BESLUT: får plats utan extra kostnad (${x.reason}) – du får skriva att det går bra och ingår i priset.`
      : `BESLUT: lova INTE att det ingår. ${x.reason} Skriv att vi tittar på hur mycket plats det tar och återkommer om priset påverkas. Lägg siffrorna i anteckningen till kontoret.`,
  ].filter(Boolean).join("\n");
}
