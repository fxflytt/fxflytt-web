/* FX Flytt – Kubikräknare (volymberäkning för flytt).
   One component used in the quote form (compact) and on /kubikraknare (full page).
   State is kept per visitor in localStorage so the two stay in sync. */
(function () {
  "use strict";
  // [id, label, m³ per piece] – typical sizes, in line with common industry figures.
  var CAT = [
    ["vardagsrum", "Vardagsrum", "🛋️", [
      ["sofa3", "Soffa 3-sits", 2.0], ["sofa2", "Soffa 2-sits", 1.5], ["sofacorner", "Hörnsoffa / divansoffa", 3.0],
      ["armchair", "Fåtölj", 0.8], ["footstool", "Fotpall / puff", 0.2], ["coffeetable", "Soffbord", 0.3],
      ["tvbench", "TV-bänk", 0.5], ["tv", "TV", 0.2], ["bookshelf", "Bokhylla", 0.8], ["shelf", "Vägghylla", 0.2],
      ["cabinet", "Vitrinskåp / skänk", 1.0], ["lamp", "Golvlampa", 0.2], ["rug", "Matta", 0.1], ["plant", "Stor växt", 0.3],
      ["painting", "Tavla / spegel", 0.05]]],
    ["sovrum", "Sovrum", "🛏️", [
      ["bed2", "Dubbelsäng 160–180 cm", 1.6], ["bed1", "Enkelsäng 90 cm", 0.8], ["bed120", "Säng 120–140 cm", 1.2],
      ["mattress", "Extra madrass / bäddmadrass", 0.4], ["wardrobe2", "Garderob 2 dörrar", 1.5], ["wardrobe1", "Garderob 1 dörr", 0.8],
      ["dresser", "Byrå", 0.6], ["nightstand", "Sängbord", 0.15], ["vanity", "Sminkbord", 0.4], ["mirror", "Helkroppsspegel", 0.1]]],
    ["barnrum", "Barnrum", "🧸", [
      ["crib", "Spjälsäng", 0.6], ["kidsbed", "Barnsäng", 0.7], ["bunkbed", "Våningssäng", 1.5],
      ["changing", "Skötbord", 0.4], ["toybox", "Leksakslåda / hylla", 0.3], ["kidsdesk", "Barnskrivbord", 0.4]]],
    ["kok", "Kök", "🍽️", [
      ["fridgebig", "Kyl/frys (hög)", 1.0], ["fridge", "Kylskåp", 0.8], ["freezer", "Frys", 0.6],
      ["dishwasher", "Diskmaskin", 0.4], ["stove", "Spis", 0.5], ["microwave", "Mikrovågsugn", 0.1],
      ["kitchentable", "Köksbord", 0.6], ["kitchenchair", "Köksstol", 0.15], ["barstool", "Barstol", 0.15], ["pantry", "Köksskåp / skafferi", 0.8]]],
    ["matsal", "Matsal", "🪑", [
      ["diningtable", "Matbord (6 pers)", 1.0], ["diningtablebig", "Stort matbord (8+ pers)", 1.5], ["chair", "Stol", 0.15],
      ["sideboard", "Skänk / sideboard", 0.8], ["display", "Vitrinskåp", 1.0]]],
    ["kontor", "Kontor", "💻", [
      ["desk", "Skrivbord", 0.6], ["officechair", "Kontorsstol", 0.3], ["filecab", "Arkivskåp / hurts", 0.3],
      ["computer", "Dator + skärm", 0.1], ["printer", "Skrivare", 0.1], ["bookcase", "Bokhylla (stor)", 1.0]]],
    ["hall", "Hall", "🚪", [
      ["shoerack", "Skohylla", 0.2], ["hallcab", "Hallmöbel / byrå", 0.4], ["coatrack", "Klädhängare", 0.2], ["hallmirror", "Spegel", 0.05]]],
    ["badrum", "Badrum & tvätt", "🛁", [
      ["washer", "Tvättmaskin", 0.5], ["dryer", "Torktumlare", 0.5], ["dryingcab", "Torkskåp", 0.6],
      ["bathcab", "Badrumsskåp", 0.2], ["laundry", "Tvättkorg", 0.1]]],
    ["ute", "Uteplats & balkong", "☀️", [
      ["outdoortable", "Utebord", 0.6], ["outdoorchair", "Utestol", 0.2], ["sunbed", "Solsäng", 0.4], ["grill", "Grill", 0.5],
      ["parasol", "Parasoll", 0.1], ["planter", "Blomlåda / kruka", 0.1], ["outdoorsofa", "Utesoffa", 1.2]]],
    ["forrad", "Förråd, källare & garage", "📦", [
      ["bike", "Cykel", 0.5], ["kidsbike", "Barncykel", 0.3], ["stroller", "Barnvagn", 0.5], ["mower", "Gräsklippare", 0.4],
      ["toolbox", "Verktyg / verktygslåda", 0.1], ["workbench", "Arbetsbänk", 0.6], ["storageshelf", "Förrådshylla", 0.5],
      ["skis", "Skidor / sportutrustning", 0.2], ["tires", "Däck (4 st)", 0.4], ["suitcase", "Resväska", 0.15], ["xmas", "Julpynt-låda", 0.1]]],
    ["kartonger", "Kartonger & säckar", "🗃️", [
      ["box", "Flyttkartong (standard)", 0.06], ["boxbig", "Stor kartong / garderobskartong", 0.15], ["bag", "Säck med kläder / textil", 0.1]]],
    ["andra", "Tungt & speciellt", "🎹", [
      ["piano", "Piano", 1.5], ["safe", "Kassaskåp", 0.4], ["aquarium", "Akvarium", 0.4], ["treadmill", "Löpband", 1.0],
      ["exbike", "Motionscykel", 0.5], ["motorbike", "Motorcykel / moped", 1.5], ["moped", "Elsparkcykel", 0.2], ["gamingchair", "Massagestol", 0.8]]]
  ];
  var ITEMS = {};
  CAT.forEach(function (c) { c[3].forEach(function (it) { ITEMS[it[0]] = { l: it[1], v: it[2], room: c[0] }; }); });

  // Quick-start templates: typical inventory for a home type (customer adjusts afterwards).
  var TEMPLATES = {
    "1 rok": { sofa2: 1, coffeetable: 1, tvbench: 1, tv: 1, bookshelf: 1, bed120: 1, wardrobe1: 1, nightstand: 1, kitchentable: 1, kitchenchair: 2, desk: 1, officechair: 1, bike: 1, box: 25 },
    "2 rok": { sofa3: 1, armchair: 1, coffeetable: 1, tvbench: 1, tv: 1, bookshelf: 2, bed2: 1, wardrobe2: 1, dresser: 1, nightstand: 2, diningtable: 1, chair: 4, desk: 1, officechair: 1, washer: 1, bike: 2, box: 35 },
    "3 rok": { sofa3: 1, armchair: 1, coffeetable: 1, tvbench: 1, tv: 1, bookshelf: 2, bed2: 1, bed1: 1, wardrobe2: 2, dresser: 2, nightstand: 3, diningtable: 1, chair: 6, sideboard: 1, desk: 1, officechair: 1, washer: 1, bike: 2, stroller: 1, outdoortable: 1, outdoorchair: 4, box: 50 },
    "4 rok": { sofacorner: 1, armchair: 2, coffeetable: 1, tvbench: 1, tv: 2, bookshelf: 3, bed2: 1, bed1: 2, wardrobe2: 3, dresser: 2, nightstand: 4, diningtable: 1, chair: 6, sideboard: 1, desk: 2, officechair: 2, washer: 1, dryer: 1, bike: 3, stroller: 1, outdoortable: 1, outdoorchair: 4, storageshelf: 1, box: 70 },
    "Villa": { sofacorner: 1, sofa2: 1, armchair: 2, coffeetable: 1, tvbench: 1, tv: 2, bookshelf: 3, bed2: 1, bed1: 2, wardrobe2: 4, dresser: 3, nightstand: 4, diningtablebig: 1, chair: 8, sideboard: 1, desk: 2, officechair: 2, washer: 1, dryer: 1, fridgebig: 1, bike: 4, mower: 1, workbench: 1, storageshelf: 2, grill: 1, outdoortable: 1, outdoorchair: 6, outdoorsofa: 1, box: 90 }
  };
  var KEY = "fx-kubik-v1";
  var state = load();
  var listeners = [];

  function load() {
    try { var s = JSON.parse(localStorage.getItem(KEY) || "{}"); return { q: s.q || {}, custom: s.custom || [] }; }
    catch (e) { return { q: {}, custom: [] }; }
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* storage blocked – ignore */ } }
  function fmt(n) { return String(Math.round(n * 10) / 10).replace(".", ","); }

  function totals() {
    var vol = 0, n = 0, boxes = 0, list = [];
    Object.keys(state.q).forEach(function (id) {
      var q = state.q[id], it = ITEMS[id]; if (!q || !it) return;
      vol += it.v * q; n += q; if (id === "box" || id === "boxbig") boxes += q; list.push(it.l + " ×" + q);
    });
    state.custom.forEach(function (c) { vol += c.v * c.q; n += c.q; list.push(c.l + " ×" + c.q + " (" + fmt(c.v) + " m³/st)"); });
    vol = Math.round(vol * 10) / 10;
    return { m3: vol, items: n, boxes: boxes, list: list };
  }
  // Truck guidance: our trucks are ~20 m³ (same rule as the price list: up to ~60–70 m² per car).
  function trucks(m3) { return m3 <= 0 ? 0 : Math.max(1, Math.ceil(m3 / 20)); }

  function publish() {
    var t = totals();
    window.fxVolume = t.items ? { m3: t.m3, items: t.items, list: t.list } : null;
    save();
    listeners.forEach(function (fn) { fn(t); });
    try { window.dispatchEvent(new CustomEvent("fx-volume", { detail: window.fxVolume })); } catch (e) {}
  }

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function mount(root, opts) {
    opts = opts || {};
    var full = !!opts.full;
    root.classList.add("kb", full ? "kb-full" : "kb-compact");
    var tpl = Object.keys(TEMPLATES).map(function (k) { return '<button type="button" class="kb-chip" data-tpl="' + k + '">' + k + "</button>"; }).join("");
    root.innerHTML =
      '<div class="kb-top">' +
        '<div class="kb-sum"><div class="kb-big"><span data-k="m3">0</span> m³</div>' +
        '<div class="kb-sub"><span data-k="items">0</span> föremål · <span data-k="boxes">0</span> kartonger · <span data-k="trucks">–</span></div></div>' +
        '<button type="button" class="kb-clear" data-act="clear">Rensa</button>' +
      "</div>" +
      '<div class="kb-start"><span>Snabbstart – fyll i en typisk bostad och justera:</span><div class="kb-chips">' + tpl + "</div></div>" +
      '<input class="kb-search" type="search" placeholder="Sök möbel, t.ex. soffa, cykel, piano…" aria-label="Sök möbel">' +
      '<div class="kb-rooms">' + CAT.map(function (c) {
        return '<details class="kb-room" data-room="' + c[0] + '"' + (full && c[0] === "vardagsrum" ? " open" : "") + '><summary><span class="kb-ic">' + c[2] + "</span>" + c[1] +
          '<span class="kb-rc" data-rc="' + c[0] + '"></span></summary>' +
          c[3].map(function (it) {
            return '<div class="kb-row" data-name="' + esc(it[1].toLowerCase()) + '"><div>' + esc(it[1]) + "<small>ca " + fmt(it[2]) + " m³</small></div>" +
              '<div class="stp"><button type="button" data-id="' + it[0] + '" data-d="-1" aria-label="Minska ' + esc(it[1]) + '">−</button>' +
              '<output data-q="' + it[0] + '">0</output><button type="button" data-id="' + it[0] + '" data-d="1" aria-label="Öka ' + esc(it[1]) + '">+</button></div></div>';
          }).join("") + "</details>";
      }).join("") +
      '<details class="kb-room" data-room="egen"><summary><span class="kb-ic">➕</span>Lägg till egen sak (mått)<span class="kb-rc" data-rc="egen"></span></summary>' +
        '<div class="kb-custom"><input data-c="l" placeholder="Vad? t.ex. Hörnskåp" maxlength="40">' +
        '<input data-c="a" type="number" inputmode="numeric" min="1" max="500" placeholder="Längd cm">' +
        '<input data-c="b" type="number" inputmode="numeric" min="1" max="500" placeholder="Bredd cm">' +
        '<input data-c="h" type="number" inputmode="numeric" min="1" max="500" placeholder="Höjd cm">' +
        '<button type="button" class="kb-add" data-act="add">Lägg till</button></div><div class="kb-clist"></div></details>' +
      "</div>" +
      '<p class="kb-norm" data-k="norm"></p>';

    function render(t) {
      root.querySelector('[data-k="m3"]').textContent = fmt(t.m3);
      root.querySelector('[data-k="items"]').textContent = t.items;
      root.querySelector('[data-k="boxes"]').textContent = t.boxes;
      var tr = trucks(t.m3);
      root.querySelector('[data-k="trucks"]').textContent = tr ? (tr === 1 ? "1 flyttbil" : tr + " flyttbilar") : "–";
      root.querySelectorAll("output[data-q]").forEach(function (o) { o.textContent = state.q[o.dataset.q] || 0; });
      var per = {};
      Object.keys(state.q).forEach(function (id) { var r = ITEMS[id] && ITEMS[id].room; if (r) per[r] = (per[r] || 0) + ITEMS[id].v * state.q[id]; });
      state.custom.forEach(function (c) { per.egen = (per.egen || 0) + c.v * c.q; });
      root.querySelectorAll("[data-rc]").forEach(function (s) { var v = per[s.dataset.rc]; s.textContent = v ? fmt(v) + " m³" : ""; });
      root.querySelector(".kb-clist").innerHTML = state.custom.map(function (c, i) {
        return '<div class="kb-row"><div>' + esc(c.l) + "<small>" + fmt(c.v) + " m³ ×" + c.q + '</small></div><button type="button" class="kb-x" data-del="' + i + '" aria-label="Ta bort">✕</button></div>';
      }).join("");
      var area = +(document.getElementById("kvm") || {}).value || 0;
      var norm = root.querySelector('[data-k="norm"]');
      norm.textContent = area > 0
        ? "Tumregel för " + area + " m²: ca " + fmt(area * 0.35) + "–" + fmt(area * 0.5) + " m³ för ett normalmöblerat hem."
        : "Tumregel: ett normalmöblerat hem tar ca 0,35–0,5 m³ per m² boyta.";
    }
    listeners.push(render);

    root.addEventListener("click", function (e) {
      var b = e.target.closest("button"); if (!b || !root.contains(b)) return;
      if (b.dataset.id) {
        var id = b.dataset.id, q = Math.max(0, Math.min(999, (state.q[id] || 0) + (+b.dataset.d)));
        if (q) state.q[id] = q; else delete state.q[id];
        publish();
      } else if (b.dataset.tpl) {
        if (totals().items && !confirm("Ersätta din nuvarande lista med en typisk " + b.dataset.tpl + "?")) return;
        state.q = JSON.parse(JSON.stringify(TEMPLATES[b.dataset.tpl])); publish();
      } else if (b.dataset.act === "clear") {
        if (totals().items && !confirm("Rensa hela listan?")) return;
        state.q = {}; state.custom = []; publish();
      } else if (b.dataset.act === "add") {
        var g = function (k) { return root.querySelector('[data-c="' + k + '"]'); };
        var a = +g("a").value, w = +g("b").value, h = +g("h").value, l = (g("l").value || "Egen sak").trim().slice(0, 40);
        if (!(a > 0 && w > 0 && h > 0)) { g("a").focus(); return; }
        state.custom.push({ l: l, v: Math.round(a * w * h / 1e5) / 10 || 0.1, q: 1 });
        ["l", "a", "b", "h"].forEach(function (k) { g(k).value = ""; });
        publish();
      } else if (b.dataset.del != null) {
        state.custom.splice(+b.dataset.del, 1); publish();
      }
    });
    root.querySelector(".kb-search").addEventListener("input", function (e) {
      var s = e.target.value.trim().toLowerCase();
      root.querySelectorAll(".kb-room").forEach(function (d) {
        var any = false;
        d.querySelectorAll(".kb-row[data-name]").forEach(function (r) { var m = !s || r.dataset.name.indexOf(s) >= 0; r.hidden = !m; any = any || m; });
        d.hidden = !!s && !any; if (s && any) d.open = true;
      });
    });
    var kvm = document.getElementById("kvm");
    if (kvm) kvm.addEventListener("input", function () { render(totals()); });
    render(totals());
  }

  window.FXKubik = { mount: mount, totals: totals, onChange: function (fn) { listeners.push(fn); fn(totals()); } };
  publish();
})();
