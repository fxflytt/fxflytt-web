/* FX Flytt – chat assistant bubble.
   Self-contained: to remove the assistant, delete the one line that loads this file
   (<script src="/chat-widget.js" defer></script>), or set ENABLED to false below. */
(function () {
  var ENABLED = true;
  if (!ENABLED || window.__fxChat) return;
  window.__fxChat = true;

  var PHONE = "076-300 07 23", TEL = "tel:+46763000723";

  // Built-in answers, used when the AI isn't connected yet or can't be reached.
  var FAQ = [
    { k: ["pris", "kost", "kosta", "timpris", "price", "سعر", "كلف"], a: "Vi har fasta priser efter boyta, efter RUT-avdrag: flytt från 2 800 kr (upp till 30 m²) och flyttstäd från 2 000 kr. Från 15 km mellan adresserna tillkommer 12 kr/km. Per timme: 2 flyttare 595 kr/tim, minst 3 timmar. Räkna ut ditt exakta pris i prisräknaren på startsidan." },
    { k: ["rut", "avdrag", "skatteverket", "خصم"], a: "RUT ger 50 % avdrag på arbetskostnaden för flytt och flyttstäd (inte lastbil, körsträcka eller material). Vi drar av det direkt på fakturan och sköter ansökan hos Skatteverket." },
    { k: ["ort", "stad", "område", "var ", "örebro", "eskilstuna", "västerås", "katrineholm", "kungsör", "مدين"], a: "Vi flyttar i Kungsör, Örebro, Eskilstuna, Västerås och Katrineholm – och längre sträckor i hela Sverige efter offert." },
    { k: ["avbok", "ändra", "omboka", "cancel", "إلغ"], a: "Du kan ändra datum eller avboka kostnadsfritt fram till 14 dagar före flyttdagen." },
    { k: ["städ", "flyttstäd", "clean", "تنظيف"], a: "Ja, vi gör flyttstäd enligt checklista – fönster och balkong ingår. Fast pris från 2 000 kr efter RUT-avdrag. Bokar du flytt och städ tillsammans får du 10 % rabatt (Premium)." },
    { k: ["boka", "offert", "book", "quote", "حجز", "عرض"], a: "Fyll i offertformuläret högst upp på sidan – det tar två minuter och är gratis och inte bindande. Du kan också ringa " + PHONE + "." },
    { k: ["flex", "rabatt", "billig", "discount"], a: "Med FlexFlytt anger du ett tidsfönster i stället för ett exakt datum och kan spara upp till 15 %." },
    { k: ["tid", "lång", "timmar", "hours"], a: "En 2:a tar oftast 4–5 timmar med två flyttare, beroende på mängd, våning och avstånd." },
    { k: ["kontakt", "telefon", "ring", "mail", "adress", "اتصال", "رقم"], a: "Ring oss på " + PHONE + " eller besök oss på Frejgatan 9B i Kungsör." }
  ];
  var QUICK = ["Vad kostar en flytt?", "Hur fungerar RUT-avdraget?", "Vilka orter flyttar ni i?", "Hur bokar jag?"];

  var css = ""
    + ".fxc-btn{position:fixed;right:18px;bottom:18px;z-index:70;width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:#ff7a1a;color:#fff;box-shadow:0 10px 26px rgba(255,122,26,.45);display:grid;place-items:center}"
    + ".fxc-btn svg{width:28px;height:28px}"
    + ".fxc-panel{position:fixed;right:18px;bottom:90px;z-index:71;width:370px;max-width:calc(100vw - 24px);height:540px;max-height:calc(100vh - 120px);background:#fff;border-radius:20px;box-shadow:0 24px 60px rgba(13,42,63,.28);display:none;flex-direction:column;overflow:hidden;font-family:'Plus Jakarta Sans',system-ui,sans-serif}"
    + ".fxc-panel.open{display:flex}"
    + ".fxc-head{background:#0d2a3f;color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}"
    + ".fxc-head b{display:block;font-size:1rem}.fxc-head small{color:#b9cad8;font-size:.78rem}"
    + ".fxc-x{margin-left:auto;background:none;border:0;color:#fff;font-size:1.5rem;cursor:pointer;line-height:1}"
    + ".fxc-msgs{flex:1;overflow:auto;padding:14px;background:#f5f7f9;display:flex;flex-direction:column;gap:8px}"
    + ".fxc-m{max-width:85%;padding:10px 13px;border-radius:14px;font-size:.92rem;line-height:1.45;white-space:pre-wrap;word-wrap:break-word}"
    + ".fxc-bot{background:#fff;color:#14212b;border:1px solid #e3e8ed;align-self:flex-start;border-bottom-left-radius:4px}"
    + ".fxc-me{background:#0d2a3f;color:#fff;align-self:flex-end;border-bottom-right-radius:4px}"
    + ".fxc-quick{display:flex;flex-wrap:wrap;gap:6px}"
    + ".fxc-quick button{border:1.5px solid #ffd9bd;background:#fff6ef;color:#0d2a3f;border-radius:999px;padding:6px 11px;font:inherit;font-size:.82rem;font-weight:600;cursor:pointer}"
    + ".fxc-form{display:flex;gap:8px;padding:10px;border-top:1px solid #e3e8ed;background:#fff}"
    + ".fxc-form input{flex:1;border:1.5px solid #e3e8ed;border-radius:12px;padding:11px 12px;font:inherit;font-size:.95rem}"
    + ".fxc-form input:focus{outline:none;border-color:#ff7a1a}"
    + ".fxc-form button{border:0;background:#ff7a1a;color:#fff;border-radius:12px;padding:0 16px;font:inherit;font-weight:700;cursor:pointer}"
    + ".fxc-note{font-size:.72rem;color:#5b6b78;text-align:center;padding:0 10px 8px;background:#fff}"
    + ".fxc-dots{display:inline-block;letter-spacing:2px;animation:fxcb 1s infinite}@keyframes fxcb{50%{opacity:.3}}"
    + "@media(max-width:900px){.fxc-btn{bottom:86px;width:54px;height:54px}.fxc-panel{bottom:150px;right:12px;height:calc(100vh - 240px)}}";
  var st = document.createElement("style"); st.textContent = css; document.head.appendChild(st);

  var btn = document.createElement("button");
  btn.className = "fxc-btn"; btn.setAttribute("aria-label", "Öppna chatten – ställ en fråga");
  btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';

  var panel = document.createElement("div");
  panel.className = "fxc-panel"; panel.setAttribute("role", "dialog"); panel.setAttribute("aria-label", "Chatt med FX Flytt");
  panel.innerHTML = '<div class="fxc-head"><div><b>FX Flytt</b><small>Ställ en fråga – vi svarar direkt</small></div><button class="fxc-x" aria-label="Stäng">×</button></div>'
    + '<div class="fxc-msgs" aria-live="polite"></div>'
    + '<form class="fxc-form"><input maxlength="1000" placeholder="Skriv din fråga…" aria-label="Din fråga"><button type="submit">Skicka</button></form>'
    + '<div class="fxc-note">Automatiska svar kan vara ungefärliga. Dela inte personnummer här.</div>';
  document.body.appendChild(btn); document.body.appendChild(panel);

  var msgsEl = panel.querySelector(".fxc-msgs"), form = panel.querySelector("form"), input = form.querySelector("input");
  var history = [], busy = false, aiAvailable = true;

  function add(role, text) {
    var d = document.createElement("div");
    d.className = "fxc-m " + (role === "user" ? "fxc-me" : "fxc-bot");
    d.textContent = text;                 // text only – never HTML from the server
    msgsEl.appendChild(d); msgsEl.scrollTop = msgsEl.scrollHeight;
    return d;
  }
  function faq(q) {
    var t = q.toLowerCase();
    for (var i = 0; i < FAQ.length; i++) for (var j = 0; j < FAQ[i].k.length; j++) if (t.indexOf(FAQ[i].k[j]) > -1) return FAQ[i].a;
    return "Bra fråga! Ring oss på " + PHONE + " så hjälper vi dig direkt, eller fyll i offertformuläret.";
  }
  async function send(text) {
    text = (text || "").trim();
    if (!text || busy) return;
    busy = true;
    add("user", text); history.push({ role: "user", content: text });
    var wait = add("bot", ""); wait.innerHTML = '<span class="fxc-dots">•••</span>';
    var reply = null;
    if (aiAvailable) {
      try {
        var r = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-12) }) });
        var data = await r.json().catch(function () { return {}; });
        if (r.ok && data.reply) reply = data.reply;
        else if (data.fallback) aiAvailable = false;
        else if (data.error) reply = data.error;
      } catch (e) { aiAvailable = false; }
    }
    if (!reply) reply = faq(text);
    reply = String(reply).replace(/\*\*(.+?)\*\*/g, "$1").replace(/^#+\s*/gm, "").replace(/^\s*[-*]\s+/gm, "• ");
    wait.textContent = reply;
    history.push({ role: "assistant", content: reply });
    busy = false;
  }

  function open() {
    panel.classList.add("open");
    if (!msgsEl.children.length) {
      add("bot", "Hej! 👋 Jag är FX Flytts assistent. Vad kan jag hjälpa dig med?");
      var q = document.createElement("div"); q.className = "fxc-quick";
      QUICK.forEach(function (t) { var b = document.createElement("button"); b.type = "button"; b.textContent = t; b.onclick = function () { q.remove(); send(t); }; q.appendChild(b); });
      msgsEl.appendChild(q);
    }
    setTimeout(function () { input.focus(); }, 50);
  }
  btn.addEventListener("click", function () { panel.classList.contains("open") ? panel.classList.remove("open") : open(); });
  panel.querySelector(".fxc-x").addEventListener("click", function () { panel.classList.remove("open"); });
  form.addEventListener("submit", function (e) { e.preventDefault(); var v = input.value; input.value = ""; send(v); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") panel.classList.remove("open"); });
})();
