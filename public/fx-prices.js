/* Shows the price list in use on the website pages.
   The pages are built with the prices from lib/pricing/prices.json, and every price is marked by
   add-price-marks.py. When the owner changes prices in admin (Inställningar → Priser), this script
   loads them from /api/price and updates the marked numbers, the price tables, the calculator and
   the chat. If it cannot load them, the page simply keeps the prices it was built with. */
(function () {
  var fmt = function (n) { return Math.round(n).toLocaleString("sv-SE").replace(/\s/g, " "); };
  var at = function (rows, m2) { for (var i = 0; i < rows.length; i++) if (m2 <= rows[i][0]) return rows[i][1]; return null; };
  var disc = function (base, pct) { return base - Math.round(base * pct / 100); };

  function value(P, key) {
    var km = P.km.pricePerKm, h = P.hourly, pr = P.packages.premium.discountPct, dx = P.packages.deluxe.discountPct;
    var simple = { h2: h["2"], h3: h["3"], h4: h["4"], minh: h.minHours, km: km, kmfree: P.km.freeBelowKm, km66: 66 * km,
      move0: P.moveFixed[0][1], clean0: P.cleaning[0][1], boxbuy: P.boxes.buy, boxrent: P.boxes.rent };
    if (key in simple) return simple[key];
    var m = /^(mv|cl|pr|dx3|pk66):(\d+)$/.exec(key);
    if (!m) return null;
    var n = +m[2], mv = at(P.moveFixed, n), cl = at(P.cleaning, n);
    if (mv == null || cl == null) return m[1] === "mv" ? mv : m[1] === "cl" ? cl : null;
    return { mv: mv, cl: cl, pr: disc(mv + cl, pr), dx3: disc(mv + cl, dx) + h.minHours * h["2"], pk66: disc(mv + cl + 66 * km, pr) }[m[1]];
  }

  function rows(list, cars) {
    var lo = 0, out = "";
    list.forEach(function (r) {
      out += "<tr><td>" + (lo ? lo + "–" + r[0] + " m²" : "upp till " + r[0] + " m²") + "</td>" + (cars ? "<td>" + r[2] + "</td>" : "") + "<td>" + fmt(r[1]) + " kr</td></tr>";
      lo = r[0] + 1;
    });
    return out;
  }

  function apply(P) {
    document.querySelectorAll("[data-fxp]").forEach(function (el) {
      var v = value(P, el.getAttribute("data-fxp"));
      if (v != null) el.textContent = fmt(v);
    });
    document.querySelectorAll("[data-fxt]").forEach(function (el) {
      el.textContent = el.getAttribute("data-fxt").replace(/\{([\w:]+)\}/g, function (all, k) { var v = value(P, k); return v == null ? all : fmt(v); });
    });
    document.querySelectorAll("[data-fxp-table]").forEach(function (el) {
      var t = el.getAttribute("data-fxp-table");
      el.innerHTML = t === "move" ? rows(P.moveFixed, true) : rows(P.cleaning, false);
    });
    window.FX_PRICES = P;
    window.dispatchEvent(new Event("fx:prices"));
  }

  fetch("/api/price").then(function (r) { return r.ok ? r.json() : null; }).then(function (P) {
    if (P && P.moveFixed && P.cleaning && P.hourly && P.km && P.boxes && P.packages) apply(P);
  }).catch(function () {});
})();
