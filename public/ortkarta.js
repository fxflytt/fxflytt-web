/* FX Flytt – karta "Här kör våra flyttbilar". Loads Leaflet only when the map scrolls into view. */
(function () {
  "use strict";
  var el = document.querySelector("[data-ortkarta]");
  if (!el) return;
  var ORTER = [
    ["kungsor", "Kungsör", 59.4227, 16.0963, true],
    ["orebro", "Örebro", 59.2753, 15.2134], ["eskilstuna", "Eskilstuna", 59.3713, 16.5098],
    ["vasteras", "Västerås", 59.6099, 16.5448], ["katrineholm", "Katrineholm", 58.9959, 16.2072],
    ["karlstad", "Karlstad", 59.3793, 13.5036], ["sodertalje", "Södertälje", 59.1955, 17.6253],
    ["akersberga", "Åkersberga", 59.4794, 18.2997], ["norrtalje", "Norrtälje", 59.758, 18.7049],
    ["nykoping", "Nyköping", 58.753, 17.0079], ["norrkoping", "Norrköping", 58.5877, 16.1924],
    ["linkoping", "Linköping", 58.4108, 15.6214], ["motala", "Motala", 58.5371, 15.0365],
    ["mjolby", "Mjölby", 58.326, 15.1312], ["jonkoping", "Jönköping", 57.7826, 14.1618],
    ["nassjo", "Nässjö", 57.6531, 14.6968], ["tranas", "Tranås", 58.0372, 14.9782],
    ["vastervik", "Västervik", 57.7584, 16.6373], ["vimmerby", "Vimmerby", 57.6656, 15.8547],
    ["ludvika", "Ludvika", 60.1496, 15.1878]
  ];
  var TRUCK = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 4h14v11H1zM15 8h4l3 3v4h-7z"/><circle cx="5.5" cy="17.5" r="2"/><circle cx="18.5" cy="17.5" r="2"/></svg>';

  function draw() {
    var L = window.L;
    var map = L.map(el, { zoomSnap: 0.25, scrollWheelZoom: false, dragging: !L.Browser.mobile, tap: false, zoomControl: true, attributionControl: true });
    map.attributionControl.setPrefix('<a href="https://leafletjs.com">Leaflet</a>');
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 12, attribution: "© OpenStreetMap" }).addTo(map);
    var pts = [];
    ORTER.forEach(function (o) {
      var home = !!o[4];
      var icon = L.divIcon({
        className: "ok-pin" + (home ? " ok-home" : ""),
        html: '<span class="ok-dot">' + TRUCK + "</span>",
        iconSize: home ? [40, 40] : [30, 30], iconAnchor: home ? [20, 20] : [15, 15], popupAnchor: [0, -16]
      });
      L.marker([o[2], o[3]], { icon: icon, title: home ? o[1] + " – kontor" : o[1], keyboard: true, zIndexOffset: home ? 1000 : 0 }).addTo(map)
        .bindPopup('<b>' + (home ? "FX Flytt – kontor i " : "Flyttfirma ") + o[1] + '</b><br><a href="flyttfirma-' + o[0] + '.html">Läs mer →</a>');
      pts.push([o[2], o[3]]);
    });
    map.fitBounds(pts, { padding: [18, 18] });
  }
  function load() {
    if (window.L) return draw();
    var c = document.createElement("link"); c.rel = "stylesheet"; c.href = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css"; document.head.appendChild(c);
    var s = document.createElement("script"); s.src = "https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.js"; s.onload = draw; document.head.appendChild(s);
  }
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (e) { if (e[0].isIntersecting) { io.disconnect(); load(); } }, { rootMargin: "300px" });
    io.observe(el);
  } else load();
})();
