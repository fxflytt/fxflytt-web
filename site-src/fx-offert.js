// "Få offert" on every page: opens the quote form in a pop-up instead of sending the visitor to the home page.
// The pop-up shows /offert (the home page's own form) and pre-fills it from this script tag:
//   <script src="/fx-offert.js" data-from="Örebro" data-svc="cleaning|" defer></script>
// Without JavaScript the links still work: they go to the form on the home page.
(function () {
  var me = document.currentScript || document.querySelector('script[src*="fx-offert.js"]');
  var FROM = (me && me.getAttribute("data-from")) || "";
  var SVC = (me && me.getAttribute("data-svc")) || "";
  var EN = (me && me.getAttribute("data-lang")) === "en";
  var L = EN ? { t: "Get a free quote", x: "Close", f: "Quote form", ok: "Thank you for your request!" }
             : { t: "Begär gratis offert", x: "Stäng", f: "Offertformulär", ok: "Tack för din förfrågan!" };
  var box, frame, lastFocus, open = false;

  function isOffertLink(a) {
    var h = a.getAttribute("href") || "";
    return /^(\/|index\.html|\/index\.html)?#offert$/.test(h);
  }

  function build() {
    var css = document.createElement("style");
    css.textContent =
      "#fx-offert{position:fixed;inset:0;z-index:2147482000;display:none;align-items:center;justify-content:center;background:rgba(13,42,63,.55)}" +
      "#fx-offert.open{display:flex}" +
      "#fx-offert .fo-box{position:relative;width:min(560px,100%);height:min(860px,92vh);background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 30px 80px rgba(0,0,0,.35);display:flex;flex-direction:column}" +
      "#fx-offert .fo-top{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px 12px 20px;border-bottom:1px solid #e3e8ed;font-weight:800;color:#0d2a3f}" +
      "#fx-offert .fo-x{width:40px;height:40px;border-radius:50%;border:0;background:#f1f4f7;color:#0d2a3f;font-size:22px;line-height:1;cursor:pointer}" +
      "#fx-offert iframe{flex:1;width:100%;border:0;display:block}" +
      "@media(max-width:700px){#fx-offert{align-items:flex-end}#fx-offert .fo-box{height:94vh;height:94dvh;border-radius:20px 20px 0 0}}" +
      "html.fo-lock,html.fo-lock body{overflow:hidden}";
    document.head.appendChild(css);
    box = document.createElement("div");
    box.id = "fx-offert";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-modal", "true");
    box.setAttribute("aria-label", L.t);
    box.innerHTML = '<div class="fo-box"><div class="fo-top"><span>' + L.t + '</span>' +
      '<button type="button" class="fo-x" aria-label="' + L.x + '">×</button></div></div>';
    frame = document.createElement("iframe");
    frame.title = L.f;
    var q = [];
    if (FROM) q.push("from=" + encodeURIComponent(FROM));
    if (SVC) q.push("svc=" + encodeURIComponent(SVC));
    if (EN) q.push("lang=en");
    frame.src = "/offert" + (q.length ? "?" + q.join("&") : "");
    box.firstChild.appendChild(frame);
    document.body.appendChild(box);
    box.querySelector(".fo-x").addEventListener("click", function () { close(true); });
    box.addEventListener("click", function (e) { if (e.target === box) close(true); });
    document.addEventListener("keydown", function (e) { if (open && e.key === "Escape") close(true); });
    window.addEventListener("message", function (e) {
      if (e.origin === location.origin && e.data && e.data.fxOffert === "done") box.querySelector(".fo-top span").textContent = L.ok;
      // Lead events from the form in the pop-up are sent from this page (only if the visitor accepted cookies).
      if (e.origin === location.origin && e.data && Array.isArray(e.data.fxGtag) && e.data.fxGtag[0] === "event" && window.gtag) {
        try { window.gtag.apply(window, e.data.fxGtag); } catch (x) {}
      }
    });
  }

  function show() {
    if (!box) build();
    lastFocus = document.activeElement;
    box.classList.add("open");
    document.documentElement.classList.add("fo-lock");
    open = true;
    box.querySelector(".fo-x").focus();
    // The phone's back button closes the pop-up instead of leaving the page.
    try { history.pushState({ fxOffert: 1 }, ""); } catch (e) {}
  }

  function close(fromUi) {
    if (!open) return;
    open = false;
    box.classList.remove("open");
    document.documentElement.classList.remove("fo-lock");
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    if (fromUi && history.state && history.state.fxOffert) { try { history.back(); } catch (e) {} }
  }

  window.addEventListener("popstate", function () { close(false); });

  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[href]");
    if (!a || !isOffertLink(a) || e.ctrlKey || e.metaKey || e.shiftKey || e.button) return;
    e.preventDefault();
    show();
  });

  // Start loading the form as soon as the finger or mouse reaches a "Få offert" button, so it opens quickly
  // without slowing down pages where nobody asks for a quote.
  function warm(e) { var a = e.target.closest && e.target.closest("a[href]"); if (!box && a && isOffertLink(a)) build(); }
  document.addEventListener("pointerover", warm, { passive: true });
  document.addEventListener("touchstart", warm, { passive: true });
})();
