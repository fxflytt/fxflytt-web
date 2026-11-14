// Scheduling rules shared by the admin page and the server: how long a job takes, when it blocks
// people and vehicles, and which assignments collide. One file so both sides agree.
//   Browser: <script src="/fx-schedule.js"></script>  → window.FXSchedule
//   Server/tests: import "…/public/fx-schedule.js"     → globalThis.FXSchedule
(function (g) {
  const OPEN = 7 * 60, CLOSE = 20 * 60;          // a job without a start time blocks the whole working day
  const INACTIVE = ["declined", "cancelled"];    // these bookings never block anyone
  const MIN_H = 1, MAX_H = 14;

  const toMin = (t) => { const m = /^(\d{2}):(\d{2})$/.exec(t || ""); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const fmtMin = (m) => String(Math.floor(m / 60) % 24).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
  const clampH = (h) => Math.min(MAX_H, Math.max(MIN_H, Math.round(h * 2) / 2));

  // A first guess of the job length in hours; the admin can always change it.
  // 1. Hours written in the price lines ("2 flyttare + bil, 4 tim × 595 kr").
  // 2. Otherwise from the living area (moving ≈ 2 h + 1 h per 25 m², cleaning only ≈ 2 h + 1 h per 40 m²)
  //    plus driving time (≈ 70 km/h) for long moves.
  function estimateHours(b) {
    const d = (b && b.data) || {}, lines = (b && b.offer && b.offer.lines) || [];
    let h = 0;
    for (const l of lines) { const m = /(\d+(?:[.,]\d+)?)\s*tim\b/.exec(String(l.label || "")); if (m) h += parseFloat(m[1].replace(",", ".")); }
    if (h > 0) return clampH(h);
    const m2 = Number(d.areaM2) || 0, cleaningOnly = /^bara flyttstäd/i.test(String(d.size || ""));
    h = m2 > 0 ? (cleaningOnly ? 2 + m2 / 40 : 2 + m2 / 25) : 4;
    if (!cleaningOnly && Number(d.distanceKm) > 30) h += Math.min(8, Number(d.distanceKm) / 70);
    return clampH(h);
  }

  const hoursOf = (b) => (typeof b.durationH === "number" && b.durationH > 0 ? b.durationH : estimateHours(b));

  // The time a booking occupies on its date, in minutes from midnight, or null without a date.
  function span(b) {
    if (!b || !/^\d{4}-\d{2}-\d{2}$/.test(b.date || "")) return null;
    const start = toMin(b.time), len = Math.round(hoursOf(b) * 60);
    if (start == null) return { date: b.date, start: OPEN, end: Math.max(CLOSE, OPEN + len), allDay: true };
    return { date: b.date, start, end: start + len, allDay: false };
  }

  const blocks = (b) => b && !INACTIVE.includes(b.status) && Array.isArray(b.crew) && b.crew.length > 0;

  // Every person/vehicle in `target` that is already on another overlapping job.
  // Returns [{ resourceId, name, kind, bookingId, customer, from, to }].
  function conflicts(target, all, resources) {
    const s = span(target);
    if (!s || !blocks(target)) return [];
    const byId = new Map((resources || []).map((r) => [r.id, r]));
    const mine = new Set(target.crew), out = [];
    for (const o of all || []) {
      if (!o || o.id === target.id || !blocks(o) || o.date !== s.date) continue;
      const t = span(o);
      if (!(t && s.start < t.end && t.start < s.end)) continue;
      for (const rid of o.crew) {
        if (!mine.has(rid)) continue;
        const r = byId.get(rid);
        out.push({ resourceId: rid, name: r ? r.name : rid, kind: r ? r.kind : "person", bookingId: o.id,
          customer: (o.data && o.data.name) || o.id, from: t.allDay ? "hela dagen" : fmtMin(t.start), to: t.allDay ? "" : fmtMin(t.end) });
      }
    }
    return out;
  }

  // Jobs per person/vehicle on one date (for "who is free" lists). Map resourceId → bookings.
  function jobsOn(date, all, exceptId) {
    const m = new Map();
    for (const o of all || []) {
      if (!blocks(o) || o.date !== date || o.id === exceptId) continue;
      for (const rid of o.crew) { if (!m.has(rid)) m.set(rid, []); m.get(rid).push(o); }
    }
    return m;
  }

  g.FXSchedule = { OPEN, CLOSE, INACTIVE, toMin, fmtMin, estimateHours, hoursOf, span, conflicts, jobsOn };
})(typeof window !== "undefined" ? window : globalThis);
