// The pricing configuration currently shown on the FX Flytt page (index.html), unchanged.
// In production this lives in the database (table pricing_config) and is edited from the admin dashboard;
// this file is only the seed / test fixture.
//
// Values marked null have NOT been provided by FX Flytt AB yet. The engine will not invent them:
// a quote that needs one is returned with status "estimate_requires_review".
//
// RUT: kept exactly as on the current page (method "selling_price", 50 % of the mover labour lines),
// by decision of FX Flytt AB on 2026-11-10. Changing it requires the owner's approval and the accountant's sign-off.

import type { PricingConfig, CatalogItem } from "./types.ts";

export const currentConfig: PricingConfig = {
  version: "2026-11-10-site-v1",
  currency: "SEK",
  vatRate: 0.25,
  moverHourSek: 500,          // 2 movers + vehicle = 1 195 kr/h, 3 movers + vehicle = 1 695 kr/h (as on the page)
  vehicleHourSek: 195,
  minHours: 3,
  hoursBySize: { "1rok": 3, "2rok": 4.5, "3rok": 5, "4rok": 6.5, villa: 8 },
  crewBySize: { "1rok": 2, "2rok": 2, "3rok": 3, "4rok": 3, villa: 3 },
  m3PerMoverHour: null,       // not provided -> hours come from hoursBySize
  noElevatorExtraHours: 1,
  carryExtraHoursPer10m: null,
  carryFreeM: 20,
  includedKm: 0,
  pricePerKmSek: null,        // page says "framkörning och milersättning tillkommer" but gives no price
  weekendSurchargePct: null,
  cleaningPerM2Sek: 50,
  cleaningRutEligible: true,
  boxVolumeM3: 0.06,
  vehicles: [],               // not provided (capacities must come from FX Flytt AB)
  rut: { method: "selling_price", rate: 0.5 },
  flexDiscountPct: 0.15,      // as shown on the page ("spara upp till 15 %") – to be confirmed by the owner
  rutAnnualCapSek: 75000,
  extras: [
    { id: "packing", label: "Packning", pricing: { type: "extra_hours", hours: 2.5, hoursIfCrew3: 3 }, rutEligible: true },
    { id: "assembly", label: "Ned- och montering", pricing: { type: "extra_hours", hours: 1 }, rutEligible: true },
    { id: "boxes", label: "Flyttkartonger", pricing: { type: "fixed", priceSek: null }, rutEligible: false },
    { id: "piano", label: "Piano / tunga föremål", pricing: { type: "per_item", priceSek: null }, rutEligible: true },
    { id: "disposal", label: "Bortforsling", pricing: { type: "fixed", priceSek: null }, rutEligible: false },
  ],
};

// Volume catalogue (m³ per item). Industry-typical estimates, editable in the admin dashboard.
export const catalog: CatalogItem[] = [
  { id: "sofa3", label: "Soffa (3-sits)", room: "Vardagsrum", volumeM3: 1.8 },
  { id: "sofa2", label: "Soffa (2-sits)", room: "Vardagsrum", volumeM3: 1.3 },
  { id: "armchair", label: "Fåtölj", room: "Vardagsrum", volumeM3: 0.7 },
  { id: "coffeetable", label: "Soffbord", room: "Vardagsrum", volumeM3: 0.3 },
  { id: "tvbench", label: "TV-bänk", room: "Vardagsrum", volumeM3: 0.4 },
  { id: "tv", label: "TV", room: "Vardagsrum", volumeM3: 0.2 },
  { id: "bookshelf", label: "Bokhylla", room: "Vardagsrum", volumeM3: 0.8 },
  { id: "diningtable", label: "Matbord", room: "Vardagsrum", volumeM3: 0.8 },
  { id: "chair", label: "Stol", room: "Vardagsrum", volumeM3: 0.15 },
  { id: "bed1", label: "Enkelsäng", room: "Sovrum", volumeM3: 0.8 },
  { id: "bed2", label: "Dubbelsäng", room: "Sovrum", volumeM3: 1.5 },
  { id: "mattress", label: "Madrass", room: "Sovrum", volumeM3: 0.4 },
  { id: "wardrobe", label: "Garderob", room: "Sovrum", volumeM3: 1.2 },
  { id: "dresser", label: "Byrå", room: "Sovrum", volumeM3: 0.5 },
  { id: "nightstand", label: "Sängbord", room: "Sovrum", volumeM3: 0.1 },
  { id: "fridge", label: "Kylskåp", room: "Kök", volumeM3: 0.8 },
  { id: "freezer", label: "Frys", room: "Kök", volumeM3: 0.6 },
  { id: "washer", label: "Tvättmaskin", room: "Kök", volumeM3: 0.5 },
  { id: "dishwasher", label: "Diskmaskin", room: "Kök", volumeM3: 0.4 },
  { id: "kitchentable", label: "Köksbord", room: "Kök", volumeM3: 0.5 },
  { id: "box", label: "Flyttkartong", room: "Övrigt", volumeM3: 0.06 },
  { id: "bicycle", label: "Cykel", room: "Övrigt", volumeM3: 0.5 },
  { id: "stroller", label: "Barnvagn", room: "Övrigt", volumeM3: 0.4 },
  { id: "outdoor", label: "Utemöbel", room: "Övrigt", volumeM3: 0.5 },
  { id: "garden", label: "Trädgårdsredskap", room: "Övrigt", volumeM3: 0.3 },
];
