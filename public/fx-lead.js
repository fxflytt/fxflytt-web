// Reads a pasted lead (a request copied from a lead site, an e-mail or a text message) and picks out
// the details for a new booking. Works on "Label: value" lines and on free text. Nothing leaves the
// browser – it is plain text matching, no AI.
//   Browser: <script src="/fx-lead.js"></script>  → window.FXLead.parse(text, today)
//   Tests:   import "…/public/fx-lead.js"          → globalThis.FXLead
(function (g) {
  const MONTHS = { jan: 1, januari: 1, feb: 2, februari: 2, mar: 3, mars: 3, apr: 4, april: 4, maj: 5, jun: 6, juni: 6, jul: 7, juli: 7,
    aug: 8, augusti: 8, sep: 9, sept: 9, september: 9, okt: 10, oktober: 10, nov: 11, november: 11, dec: 12, december: 12 };
  // Label words (lower case, without ":") → field. The longest matching label wins.
  const LABELS = [
    ["name", ["namn", "kundnamn", "kontaktperson", "för- och efternamn", "fullständigt namn", "name", "kund"]],
    ["phone", ["telefon", "telefonnummer", "tel", "mobil", "mobilnummer", "mobiltelefon", "phone", "tfn"]],
    ["email", ["e-post", "epost", "e-mail", "email", "mejl", "mail", "e-postadress"]],
    ["from", ["från", "flyttar från", "från adress", "frånadress", "nuvarande adress", "adress från", "upphämtningsadress", "avflyttningsadress", "gammal adress", "flytt från"]],
    ["to", ["till", "flyttar till", "till adress", "tilladress", "ny adress", "adress till", "inflyttningsadress", "leveransadress", "flytt till"]],
    ["addr", ["adress", "städadress", "gatuadress"]],
    ["date", ["datum", "flyttdatum", "önskat datum", "önskat flyttdatum", "när", "städdatum", "datum för flytt", "önskad dag"]],
    ["area", ["boyta", "boarea", "storlek", "yta", "kvm", "m2", "m²", "bostadsyta", "antal kvm", "bostadens storlek"]],
    ["home", ["bostadstyp", "typ av bostad", "boende", "bostad", "typ av boende", "hustyp"]],
    ["floorFrom", ["våning från", "våningsplan från", "våning (från)"]],
    ["floorTo", ["våning till", "våningsplan till", "våning (till)"]],
    ["floor", ["våning", "våningsplan"]],
    ["service", ["tjänst", "tjänster", "typ av tjänst", "uppdrag", "vad gäller det"]],
    ["message", ["meddelande", "övrigt", "beskrivning", "kommentar", "info", "information", "övrig information", "önskemål", "fritext"]],
  ];
  const labelOf = (s) => {
    const k = s.toLowerCase().replace(/[*:]+$/g, "").replace(/\s+/g, " ").trim();
    let best = null;
    for (const [f, ws] of LABELS) for (const w of ws) if (k === w && (!best || w.length > best[1])) best = [f, w.length];
    return best && best[0];
  };
  const pad = (n) => String(n).padStart(2, "0");
  const iso = (y, m, d) => (m >= 1 && m <= 12 && d >= 1 && d <= 31 ? `${y}-${pad(m)}-${pad(d)}` : "");
  // A date without a year: the next time it comes round.
  const withYear = (m, d, today) => { const y = Number(today.slice(0, 4)); const a = iso(y, m, d); return a && a < today ? iso(y + 1, m, d) : a; };

  function findDate(s, today) {
    let m = /\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/.exec(s); if (m) return iso(+m[1], +m[2], +m[3]);
    m = /\b(\d{1,2})[\/.](\d{1,2})[\/.\-](20\d{2}|\d{2})\b/.exec(s); if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = /\b(\d{1,2})(?:e|:e|a|:a)?\s+(januari|februari|mars|april|maj|juni|juli|augusti|september|oktober|november|december|jan|feb|mar|apr|jun|jul|aug|sept|sep|okt|nov|dec)\.?(?:\s+(20\d{2}))?/i.exec(s);
    if (m) { const mo = MONTHS[m[2].toLowerCase()], d = +m[1]; return m[3] ? iso(+m[3], mo, d) : withYear(mo, d, today); }
    m = /\b(\d{1,2})\/(\d{1,2})\b/.exec(s); if (m) return withYear(+m[2], +m[1], today);
    return "";
  }
  const findPhone = (s) => { const m = /(?:\+46|0046|\b0)[\s-]?\(?0?\)?[1-9](?:[\s-]?\d){6,10}\b/.exec(s); return m ? m[0].trim() : ""; };
  const findEmail = (s) => { const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(s); return m ? m[0] : ""; };
  const findArea = (s) => { const m = /(\d{2,4})(?:[.,]\d)?\s*(?:m²|m2|kvm|kvadrat|sqm)\b/i.exec(s); return m ? m[1] : ""; };
  const findHome = (s) => { const m = /\b(lägenhet|villa|radhus|parhus|hus|kontor|förråd|studentrum|stuga)\b/i.exec(s); if (!m) return ""; const w = m[1].toLowerCase(); return w === "hus" ? "Villa" : w[0].toUpperCase() + w.slice(1); };
  const findFlex = (s) => { const m = /±\s*(\d+)\s*(dagar|dag|veckor|vecka|månader|månad)/i.exec(s) || /\+\/-\s*(\d+)\s*(dagar|dag|veckor|vecka|månader|månad)/i.exec(s);
    return m ? `± ${m[1]} ${m[2]}` : /flexibel|flexibelt|valfritt datum|spelar ingen roll/i.test(s) ? "Flexibelt" : ""; };
  const floorTxt = (s) => { const m = /(\d{1,2})\s*(?:tr|trappor|trappa|vån|:e)/i.exec(s) || /våning\s*(\d{1,2})/i.exec(s); if (/botten|markplan|entréplan/i.test(s)) return "Bottenplan"; if (!m) return ""; const n = +m[1]; return n === 0 ? "Bottenplan" : n >= 10 ? "10 tr eller högre" : n + " tr"; };
  const liftTxt = (s) => (/ingen hiss|utan hiss|hiss saknas|ej hiss/i.test(s) ? "Ingen hiss" : /stor hiss/i.test(s) ? "Stor hiss" : /liten hiss|hiss/i.test(s) ? "Liten hiss" : "");

  function parse(text, today) {
    today = today || new Date().toISOString().slice(0, 10);
    const raw = String(text || "").replace(/\r/g, "").replace(/ /g, " ");
    const out = { name: "", phone: "", email: "", from: "", to: "", date: "", flex: "", areaM2: "", home: "", floorFrom: "", floorTo: "", liftFrom: "", liftTo: "", message: "",
      wants: { clean: false, pack: false, storage: false, move: false }, svc: "", found: [] };
    const lines = raw.split("\n").map((l) => l.trim()).filter(Boolean);
    const rest = [];
    let last = null;
    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      let f = null, val = "";
      const m = /^([^:]{2,40}):\s*(.*)$/.exec(l);
      if (m && (f = labelOf(m[1]))) val = m[2].trim();
      else if ((f = labelOf(l)) && i + 1 < lines.length && !labelOf(lines[i + 1].replace(/:.*$/, ""))) { val = lines[++i]; }   // label on its own line, value below
      if (!f) { if (last === "message") { out.message += "\n" + l; continue; } rest.push(l); continue; }
      last = f;
      if (!val) continue;
      if (f === "name" && !out.name) out.name = val;
      else if (f === "phone" && !out.phone) out.phone = findPhone(val) || val;
      else if (f === "email" && !out.email) out.email = findEmail(val) || val;
      else if (f === "from" && !out.from) out.from = val;
      else if (f === "to" && !out.to) out.to = val;
      else if (f === "addr" && !out.from) out.from = val;
      else if (f === "date" && !out.date) { out.date = findDate(val, today); out.flex = out.flex || findFlex(val); }
      else if (f === "area" && !out.areaM2) out.areaM2 = (/(\d{1,4})/.exec(val) || [])[1] || "";
      else if (f === "home" && !out.home) out.home = findHome(val) || val;
      else if (f === "floorFrom") { out.floorFrom = floorTxt(val) || floorTxt(val + " tr"); out.liftFrom = liftTxt(val); }
      else if (f === "floorTo") { out.floorTo = floorTxt(val) || floorTxt(val + " tr"); out.liftTo = liftTxt(val); }
      else if (f === "floor" && !out.floorFrom) { out.floorFrom = floorTxt(val) || floorTxt(val + " tr"); out.liftFrom = liftTxt(val); }
      else if (f === "service") rest.push(val);
      else if (f === "message") out.message = (out.message ? out.message + "\n" : "") + val;
    }
    const all = raw, free = rest.join("\n");
    // Free text: "från X till Y", "X → Y"
    if (!out.from || !out.to) {
      const r = /från\s+([^\n,.→]+?(?:,\s*[^\n,.→]+?)?)\s+till\s+([^\n.→]+?)(?:[.,\n]|\s+den\s|\s+om\s|\s+i\s+\w+\s+\d|$)/i.exec(free) || /([A-ZÅÄÖ][^\n→>]{1,60}?)\s*(?:→|->|–>|=>)\s*([A-ZÅÄÖ][^\n·|]{1,60})/.exec(all);
      if (r) { if (!out.from) out.from = r[1].split(/[·|]/).pop().trim(); if (!out.to) out.to = r[2].trim().replace(/\s*·.*$/, ""); }
    }
    if (!out.phone) out.phone = findPhone(all);
    if (!out.email) out.email = findEmail(all);
    if (!out.areaM2) out.areaM2 = findArea(all);
    if (!out.date) out.date = findDate(free, today) || findDate(all, today);
    if (!out.flex) out.flex = findFlex(all);
    if (!out.home) out.home = findHome(all);
    // A name on its own line (2–4 words starting with capitals, no digits or @) if no label gave one
    if (!out.name) {
      const cand = lines.find((l) => /^[A-ZÅÄÖÉ][a-zåäöéü'-]+(?:\s+[A-ZÅÄÖÉ][a-zåäöéü'-]+){1,3}$/.test(l) && !/^(Från|Till|Hej|Datum|Flytt|Städ|Bohagsflytt|Villa|Lägenhet)\b/.test(l));
      if (cand) out.name = cand;
    }
    // What the customer wants
    const t = all.toLowerCase();
    out.wants.clean = /städ|flyttstäd/.test(t);
    out.wants.pack = /\bpack|packning|packhjälp|nedpackning/.test(t);
    out.wants.storage = /magasin|förvaring|magasinering|lagring/.test(t);
    out.wants.move = /flytt(?!stä)|bohag|bärhjälp|flytta/.test(t.replace(/flyttstäd\w*/g, ""));
    out.svc = out.wants.pack ? "move|deluxe" : out.wants.clean && out.wants.move ? "move|premium" : out.wants.clean ? "cleaning|" : out.wants.move || out.from || out.to ? "move|bas" : "";
    if (/kontorsflytt|företagsflytt/.test(t)) out.svc = "other|";   // a piano is noted in the message, the move is still a normal one
    out.message = out.message.trim();
    for (const k of ["name", "phone", "email", "from", "to", "date", "areaM2", "home"]) if (out[k]) out.found.push(k);
    return out;
  }

  g.FXLead = { parse, findDate, findPhone };
})(typeof window !== "undefined" ? window : globalThis);
