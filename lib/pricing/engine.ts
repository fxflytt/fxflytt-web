// FX Flytt – pricing engine.
// Pure function: same input + same config => same quote. Runs ONLY on the server.
// The browser may call it through the API to show a live estimate, but the booking endpoint
// always recomputes the quote itself and ignores any price sent by the client.

import type { CatalogItem, PricingConfig, Quote, QuoteInput, QuoteLine } from "./types.ts";

export class ValidationError extends Error {
  field: string;
  constructor(field: string, message: string) { super(message); this.name = "ValidationError"; this.field = field; }
}

const SIZES = ["1rok", "2rok", "3rok", "4rok", "villa"] as const;
const roundKr = (n: number) => Math.round(n);
const roundUpHalfHour = (h: number) => Math.ceil(h * 2 - 1e-9) / 2;

function num(v: unknown, field: string, min: number, max: number): number {
  if (typeof v !== "number" || !Number.isFinite(v) || v < min || v > max) {
    throw new ValidationError(field, `${field} must be a number between ${min} and ${max}`);
  }
  return v;
}

export function validateInput(i: QuoteInput): void {
  if (i.kind !== "private" && i.kind !== "business") throw new ValidationError("kind", "invalid kind");
  if (!["apartment", "house", "office"].includes(i.propertyType)) throw new ValidationError("propertyType", "invalid propertyType");
  if (!(SIZES as readonly string[]).includes(i.size)) throw new ValidationError("size", "invalid size");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || Number.isNaN(Date.parse(i.date + "T12:00:00Z"))) throw new ValidationError("date", "invalid date");
  for (const [k, a] of [["pickup", i.pickup], ["delivery", i.delivery]] as const) {
    if (!a) throw new ValidationError(k, `${k} is required`);
    num(a.floor, `${k}.floor`, 0, 60);
    num(a.carryDistanceM, `${k}.carryDistanceM`, 0, 500);
    if (typeof a.elevator !== "boolean") throw new ValidationError(`${k}.elevator`, "must be boolean");
  }
  if (i.drivingDistanceKm !== null) num(i.drivingDistanceKm, "drivingDistanceKm", 0, 3000);
  if (i.knownVolumeM3 != null) num(i.knownVolumeM3, "knownVolumeM3", 0, 300);
  if (i.cleaningM2 != null) num(i.cleaningM2, "cleaningM2", 0, 2000);
  if (!Array.isArray(i.inventory) || i.inventory.length > 300) throw new ValidationError("inventory", "invalid inventory");
  i.inventory.forEach((l, n) => {
    num(l.qty, `inventory[${n}].qty`, 0, 500);
    if (!Number.isInteger(l.qty)) throw new ValidationError(`inventory[${n}].qty`, "qty must be an integer");
    if (!l.itemId) {
      if (!l.label || typeof l.label !== "string" || l.label.length > 80) throw new ValidationError(`inventory[${n}].label`, "custom item needs a label (max 80 chars)");
      num(l.volumeM3, `inventory[${n}].volumeM3`, 0.01, 20);
    }
  });
  if (!Array.isArray(i.extras) || i.extras.length > 20) throw new ValidationError("extras", "invalid extras");
  if (typeof i.wantsRut !== "boolean") throw new ValidationError("wantsRut", "must be boolean");
  if (i.flex !== undefined && typeof i.flex !== "boolean") throw new ValidationError("flex", "must be boolean");
}

function isWeekend(date: string): boolean {
  const d = new Date(date + "T12:00:00Z").getUTCDay();
  return d === 0 || d === 6;
}

export function computeQuote(input: QuoteInput, cfg: PricingConfig, catalog: CatalogItem[]): Quote {
  validateInput(input);
  const byId = new Map(catalog.map((c) => [c.id, c]));
  const extrasById = new Map(cfg.extras.map((e) => [e.id, e]));
  const review: string[] = [];
  const lines: QuoteLine[] = [];

  // --- Volume & inventory -------------------------------------------------
  let volume = 0, items = 0, boxes = 0;
  for (const [n, l] of input.inventory.entries()) {
    if (l.qty === 0) continue;
    let v: number;
    if (l.itemId) {
      const c = byId.get(l.itemId);
      if (!c) throw new ValidationError(`inventory[${n}].itemId`, `unknown item ${l.itemId}`);
      v = c.volumeM3;
      if (c.id === "box") boxes += l.qty;
    } else {
      v = l.volumeM3 as number;
    }
    volume += v * l.qty;
    items += l.qty;
  }
  if (items === 0 && input.knownVolumeM3) volume = input.knownVolumeM3;
  volume = Math.round(volume * 100) / 100;

  // --- Crew & hours -------------------------------------------------------
  const crew = cfg.crewBySize[input.size];
  let hours: number;
  if (cfg.m3PerMoverHour && volume > 0) hours = volume / (crew * cfg.m3PerMoverHour);
  else hours = cfg.hoursBySize[input.size];

  const noElevator = [input.pickup, input.delivery].some((a) => a.floor > 0 && !a.elevator);
  if (noElevator) hours += cfg.noElevatorExtraHours;

  for (const [k, a] of [["upphämtning", input.pickup], ["leverans", input.delivery]] as const) {
    if (a.carryDistanceM > cfg.carryFreeM) {
      if (cfg.carryExtraHoursPer10m == null) review.push(`Lång bärsträcka vid ${k} (${a.carryDistanceM} m) – pris bekräftas manuellt`);
      else hours += Math.ceil((a.carryDistanceM - cfg.carryFreeM) / 10) * cfg.carryExtraHoursPer10m;
    }
  }

  const fixedExtras: QuoteLine[] = [];
  for (const id of input.extras) {
    const e = extrasById.get(id);
    if (!e) throw new ValidationError("extras", `unknown extra ${id}`);
    const p = e.pricing;
    if (p.type === "extra_hours") {
      const h = crew >= 3 && p.hoursIfCrew3 != null ? p.hoursIfCrew3 : p.hours;
      if (h == null) review.push(`${e.label}: tidsåtgång ej konfigurerad`);
      else hours += h;
    } else {
      const price = p.priceSek;
      if (price == null) review.push(`${e.label}: pris bekräftas manuellt`);
      fixedExtras.push({ code: `extra:${e.id}`, label: e.label, qty: 1, unit: "st", unitPriceSek: price, amountSek: price, rutEligible: e.rutEligible });
    }
  }
  hours = Math.max(cfg.minHours, roundUpHalfHour(hours));

  // --- Lines --------------------------------------------------------------
  lines.push({ code: "labour", label: `${crew} flyttare × ${hours} tim`, qty: crew * hours, unit: "tim",
    unitPriceSek: cfg.moverHourSek, amountSek: roundKr(crew * hours * cfg.moverHourSek), rutEligible: true });
  lines.push({ code: "vehicle", label: `Lastbil × ${hours} tim`, qty: hours, unit: "tim",
    unitPriceSek: cfg.vehicleHourSek, amountSek: roundKr(hours * cfg.vehicleHourSek), rutEligible: false });

  const km = input.drivingDistanceKm;
  if (km == null) review.push("Körsträcka saknas – beräknas när adresserna är verifierade");
  else if (km > cfg.includedKm) {
    const billable = Math.round((km - cfg.includedKm) * 10) / 10;
    if (cfg.pricePerKmSek == null) review.push(`Körsträcka ${km} km – milersättning bekräftas manuellt`);
    lines.push({ code: "distance", label: `Körsträcka (${billable} km)`, qty: billable, unit: "km",
      unitPriceSek: cfg.pricePerKmSek, amountSek: cfg.pricePerKmSek == null ? null : roundKr(billable * cfg.pricePerKmSek), rutEligible: false });
  }

  lines.push(...fixedExtras);

  if (input.cleaningM2 && input.cleaningM2 > 0) {
    lines.push({ code: "cleaning", label: `Flyttstäd ${input.cleaningM2} m²`, qty: input.cleaningM2, unit: "m²",
      unitPriceSek: cfg.cleaningPerM2Sek, amountSek: roundKr(input.cleaningM2 * cfg.cleaningPerM2Sek), rutEligible: cfg.cleaningRutEligible });
  }

  if (isWeekend(input.date)) {
    if (cfg.weekendSurchargePct == null) review.push("Helgdag – eventuellt helgtillägg bekräftas manuellt");
    else if (cfg.weekendSurchargePct > 0) {
      const base = lines.filter((l) => l.code === "labour" || l.code === "vehicle").reduce((s, l) => s + (l.amountSek ?? 0), 0);
      lines.push({ code: "weekend", label: `Helgtillägg ${Math.round(cfg.weekendSurchargePct * 100)} %`, qty: 1, unit: "st",
        unitPriceSek: null, amountSek: roundKr(base * cfg.weekendSurchargePct), rutEligible: false });
    }
  }

  // --- FlexFlytt discount (applied to every line, so RUT is computed on what is actually paid)
  if (input.flex) {
    if (cfg.flexDiscountPct == null) review.push("FlexFlytt-rabatt bekräftas manuellt");
    else if (cfg.flexDiscountPct > 0) {
      const f = 1 - cfg.flexDiscountPct;
      for (const l of lines) {
        if (l.amountSek != null) l.amountSek = roundKr(l.amountSek * f);
        if (l.unitPriceSek != null) l.unitPriceSek = Math.round(l.unitPriceSek * f * 100) / 100;
      }
      lines.forEach((l) => { if (l.code === "labour") l.label += ` (FlexFlytt −${Math.round(cfg.flexDiscountPct! * 100)} %)`; });
    }
  }

  // --- Vehicle recommendation (informational) ------------------------------
  let recommendedVehicle: string | null = null;
  const fit = [...cfg.vehicles].sort((a, b) => a.capacityM3 - b.capacityM3).find((v) => v.capacityM3 >= volume);
  if (fit) recommendedVehicle = fit.label;
  else if (cfg.vehicles.length && volume > 0) recommendedVehicle = "Flera fordon / flera turer";

  // --- Totals & RUT -------------------------------------------------------
  const total = lines.reduce((s, l) => s + (l.amountSek ?? 0), 0);
  let rutBase = 0;
  if (input.wantsRut && input.kind === "private") {
    const eligible = lines.filter((l) => l.rutEligible && l.amountSek != null);
    if (cfg.rut.method === "selling_price") {
      rutBase = eligible.reduce((s, l) => s + (l.amountSek as number), 0);
    } else {
      const r = cfg.rut;
      if (r.hourlyWageSek == null) review.push("RUT (lönemetoden): timlön saknas – RUT beräknas manuellt");
      else {
        const labour = eligible.find((l) => l.code === "labour");
        if (labour) {
          const wageBased = labour.qty * r.hourlyWageSek * r.uplift * (1 + r.vatRate);
          rutBase += Math.min(labour.amountSek as number, wageBased);
        }
        if (eligible.some((l) => l.code !== "labour")) review.push("RUT (lönemetoden) för tillval/städ kräver timunderlag – bekräftas manuellt");
      }
    }
  } else if (input.wantsRut && input.kind === "business") {
    review.push("RUT gäller endast privatpersoner");
  }
  rutBase = roundKr(rutBase);
  const deduction = Math.min(roundKr(rutBase * cfg.rut.rate), cfg.rutAnnualCapSek);

  return {
    configVersion: cfg.version,
    status: review.length || lines.some((l) => l.amountSek == null) ? "estimate_requires_review" : "estimate",
    reviewReasons: review,
    volumeM3: volume,
    itemCount: items,
    estimatedBoxes: boxes,
    crew,
    hours,
    recommendedVehicle,
    distanceKm: km,
    lines,
    totalBeforeRutSek: roundKr(total),
    rutBaseSek: rutBase,
    rutDeductionSek: deduction,
    totalAfterRutSek: roundKr(total - deduction),
  };
}
