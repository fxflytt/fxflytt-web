// FX Flytt – pricing types.
// All prices are in SEK, including VAT (moms), unless a field name says otherwise.
// A value of `null` in the config means "not yet provided by FX Flytt AB":
// the engine never invents a price for it; the quote is flagged for manual review instead.

export type MoveKind = "private" | "business";
export type PropertyType = "apartment" | "house" | "office";
export type MoveSize = "1rok" | "2rok" | "3rok" | "4rok" | "villa";

export interface Access {
  floor: number;            // 0 = ground floor
  elevator: boolean;
  carryDistanceM: number;   // parking -> entrance, metres
}

export interface InventoryLine {
  itemId?: string;          // id from the catalog, or omitted for a custom item
  label?: string;           // required for custom items
  volumeM3?: number;        // required for custom items; ignored for catalog items
  qty: number;
}

export interface QuoteInput {
  kind: MoveKind;
  propertyType: PropertyType;
  size: MoveSize;
  date: string;             // YYYY-MM-DD
  pickup: Access;
  delivery: Access;
  drivingDistanceKm: number | null;   // from the routing API, computed on the server
  inventory: InventoryLine[];
  knownVolumeM3?: number | null;      // customer-entered total, if they know it
  extras: string[];                   // ids of extra services (packing, assembly, ...)
  cleaningM2?: number | null;         // flyttstäd area, if selected
  wantsRut: boolean;                  // private customers only
  flex?: boolean;                     // FlexFlytt: flexible date window
}

export interface CatalogItem { id: string; label: string; room: string; volumeM3: number; }

export interface ExtraService {
  id: string;
  label: string;
  // How the extra is priced. Exactly one of these is used.
  pricing:
    | { type: "fixed"; priceSek: number | null }
    | { type: "extra_hours"; hours: number | null; hoursIfCrew3?: number | null }  // adds crew hours (labour)
    | { type: "per_item"; priceSek: number | null };
  rutEligible: boolean;
}

/** RUT method A: deduction = rate × (labour lines as invoiced). This is the CURRENT configuration. */
export interface RutSellingPrice { method: "selling_price"; rate: number; }
/** RUT method B (Skatteverket 2017 position): labour = paid hourly wage × uplift (2.5) + VAT, per worked hour.
 *  Not enabled until FX Flytt AB's accountant approves it. */
export interface RutWageUplift { method: "wage_uplift"; rate: number; hourlyWageSek: number | null; uplift: number; vatRate: number; }

export interface PricingConfig {
  version: string;                    // stored on every quote for traceability
  currency: "SEK";
  vatRate: number;                    // 0.25
  moverHourSek: number;               // labour price per mover-hour, incl. VAT
  vehicleHourSek: number;             // vehicle price per hour, incl. VAT (not RUT-eligible)
  minHours: number;
  hoursBySize: Record<MoveSize, number>;   // fallback when no volume is known
  crewBySize: Record<MoveSize, number>;
  m3PerMoverHour: number | null;           // productivity; null = use hoursBySize
  noElevatorExtraHours: number;            // added once if any address above ground floor has no elevator
  carryExtraHoursPer10m: number | null;    // per 10 m beyond `carryFreeM`
  carryFreeM: number;
  includedKm: number;
  pricePerKmSek: number | null;
  weekendSurchargePct: number | null;
  cleaningPerM2Sek: number;
  cleaningRutEligible: boolean;
  boxVolumeM3: number;                     // size of one moving box
  vehicles: { label: string; capacityM3: number }[];  // used only to recommend a vehicle size
  rut: RutSellingPrice | RutWageUplift;
  flexDiscountPct: number | null;          // FlexFlytt discount, e.g. 0.15
  rutAnnualCapSek: number;                 // per person and year (ROT+RUT combined)
  extras: ExtraService[];
}

export interface QuoteLine {
  code: string;
  label: string;
  qty: number;
  unit: string;
  unitPriceSek: number | null;
  amountSek: number | null;      // null = price must be confirmed manually
  rutEligible: boolean;
}

export interface Quote {
  configVersion: string;
  status: "estimate" | "estimate_requires_review";
  reviewReasons: string[];
  volumeM3: number;
  itemCount: number;
  estimatedBoxes: number;
  crew: number;
  hours: number;
  recommendedVehicle: string | null;
  distanceKm: number | null;
  lines: QuoteLine[];
  totalBeforeRutSek: number;
  rutBaseSek: number;
  rutDeductionSek: number;
  totalAfterRutSek: number;
}
