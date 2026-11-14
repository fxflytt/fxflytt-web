// Typed access to the scheduling rules in public/fx-schedule.js (the same file the admin page loads).
import "../../public/fx-schedule.js";
import type { Booking } from "./store.ts";
import type { Resource } from "./team.ts";

export type Conflict = { resourceId: string; name: string; kind: Resource["kind"]; bookingId: string; customer: string; from: string; to: string };
type Span = { date: string; start: number; end: number; allDay: boolean };
type Sched = {
  OPEN: number; CLOSE: number;
  fmtMin(m: number): string;
  estimateHours(b: Partial<Booking>): number;
  hoursOf(b: Partial<Booking>): number;
  span(b: Partial<Booking>): Span | null;
  conflicts(target: Partial<Booking>, all: Partial<Booking>[], resources: Resource[]): Conflict[];
  jobsOn(date: string, all: Partial<Booking>[], exceptId?: string): Map<string, Booking[]>;
};

export const schedule = (globalThis as unknown as { FXSchedule: Sched }).FXSchedule;
