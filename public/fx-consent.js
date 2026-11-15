// Cookie consent + Google Analytics 4. GA loads ONLY after the visitor clicks "Godkänn".
// Set GA_ID to the measurement ID from Google Analytics (Admin → Data streams), e.g. "G-ABC123XYZ".
// While GA_ID is empty nothing is loaded and no banner is shown.
(function () {
  var GA_ID = "G-EPPXSBN284";
  var KEY = "fx-consent"; // "granted" | "denied"
  var EMBED = window.parent !== window;
  if (!/^G-[A-Z0-9]+$/.test(GA_ID)) return;

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    // Inside the quote pop-up (/offert) only the lead event counts, not an extra page view.
    gtag("config", GA_ID, { anonymize_ip: true, send_page_view: !EMBED });
    var s = document.createElement("script");
    s.async = true;
    s.src = "https://www.googletagmanager.com/gtag/js?id=" + GA_ID;
    document.head.appendChild(s);
  }

  function clearGA() {
    // Remove GA cookies set earlier on this site.
    document.cookie.split(";").forEach(function (c) {
      var n = c.split("=")[0].trim();
      if (n === "_ga" || n.indexOf("_ga_") === 0) {
        var host = location.hostname.replace(/^www\./, "");
        ["", "; domain=." + host, "; domain=" + location.hostname].forEach(function (d) {
          document.cookie = n + "=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/" + d;
        });
      }
    });
  }

  function banner() {
    if (document.getElementById("fx-consent")) return;
    var css = document.createElement("style");
    css.textContent =
      "#fx-consent{position:fixed;left:16px;bottom:16px;z-index:2147483000;max-width:400px;background:#fff;color:#14212b;" +
      "border:1px solid #e3e8ed;border-radius:16px;box-shadow:0 12px 40px rgba(13,42,63,.18);padding:18px 18px 16px;font-family:inherit;font-size:15px;line-height:1.5}" +
      "#fx-consent b{display:block;color:#0d2a3f;font-size:1rem;margin-bottom:4px}" +
      "#fx-consent p{margin:0 0 14px;color:#5b6b78;font-size:.9rem}#fx-consent a{color:#0d2a3f}" +
      "#fx-consent .r{display:flex;gap:8px}#fx-consent button{flex:1;font:inherit;font-weight:700;border-radius:999px;padding:10px 14px;cursor:pointer}" +
      "#fx-consent .y{background:#0d2a3f;color:#fff;border:2px solid #0d2a3f}#fx-consent .n{background:#fff;color:#0d2a3f;border:2px solid #0d2a3f}" +
      "@media(max-width:700px){#fx-consent{left:12px;right:12px;bottom:84px;max-width:none}}";
    var box = document.createElement("div");
    box.id = "fx-consent";
    box.setAttribute("role", "dialog");
    box.setAttribute("aria-label", "Cookie-inställningar");
    box.innerHTML =
      "<b>Får vi mäta besöken?</b>" +
      "<p>Vi vill använda Google Analytics för att se hur sidan används och göra den bättre. Inga kakor sätts förrän du godkänner. " +
      "<a href=\"/integritetspolicy#kakor\">Läs mer om kakor</a></p>" +
      "<div class=\"r\"><button type=\"button\" class=\"n\">Nej tack</button><button type=\"button\" class=\"y\">Godkänn</button></div>";
    document.head.appendChild(css);
    document.body.appendChild(box);
    box.querySelector(".y").onclick = function () { set("granted"); box.remove(); loadGA(); };
    box.querySelector(".n").onclick = function () { set("denied"); box.remove(); clearGA(); };
  }

  // Lets the privacy policy offer "Ändra cookie-inställningar".
  window.fxCookieSettings = function () {
    try { localStorage.removeItem(KEY); } catch (e) {}
    if (window.gtag) { clearGA(); location.reload(); return; }
    banner();
  };

  var c = get();
  if (c === "granted") loadGA();
  else if (c !== "denied" && !EMBED) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", banner);
    else banner();
  }
})();
