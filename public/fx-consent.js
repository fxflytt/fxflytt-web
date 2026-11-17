// Cookie consent + Google Analytics 4. GA loads ONLY after the visitor clicks "Godkänn".
// Set GA_ID to the measurement ID from Google Analytics (Admin → Data streams), e.g. "G-ABC123XYZ".
// While GA_ID is empty nothing is loaded and no banner is shown.
(function () {
  var GA_ID = "G-EPPXSBN284";
  var KEY = "fx-consent"; // "granted" | "denied"
  var EMBED = window.parent !== window;
  if (!/^G-[A-Z0-9]+$/.test(GA_ID)) return;

  // Clicks on the phone number and the e-mail address, as events "phone_click" / "email_click".
  // Sent only if GA is loaded (the visitor accepted); inside the quote pop-up they go to the page around it.
  // "placement" says which button: header, mobile bar, menu, footer, pop-up or page.
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest('a[href^="tel:"],a[href^="mailto:"]');
    if (!a || typeof window.gtag !== "function") return;
    var phone = a.getAttribute("href").indexOf("tel:") === 0;
    var where = EMBED ? "offert_popup" : a.closest(".mbar") ? "mobile_bar" : a.closest("header") ? "header" :
      a.closest(".drawer") ? "menu" : a.closest("footer") ? "footer" : a.closest(".fxc-panel,[class*=fxc]") ? "chat" : "page";
    try { window.gtag("event", phone ? "phone_click" : "email_click", { placement: where }); } catch (x) {}
  }, true);

  if (EMBED) return; // inside the quote pop-up: the page around it handles analytics

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  function loadGA() {
    if (window.gtag) return;
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    gtag("js", new Date());
    gtag("config", GA_ID, { anonymize_ip: true });
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
      "#fx-consent .s{display:none}" +
      "#fx-consent .y{background:#0d2a3f;color:#fff;border:2px solid #0d2a3f}#fx-consent .n{background:#fff;color:#0d2a3f;border:2px solid #0d2a3f}" +
      "@media(max-width:700px){#fx-consent{left:8px;right:8px;bottom:80px;max-width:none;padding:10px 12px;border-radius:14px;display:flex;align-items:center;gap:10px;font-size:13px;line-height:1.35}#fx-consent b,#fx-consent .l{display:none}#fx-consent .s{display:inline}#fx-consent p{margin:0;flex:1;font-size:.8rem}#fx-consent .r{flex:none;gap:6px}#fx-consent button{flex:none;padding:7px 12px;font-size:.8rem}}";
    var box = document.createElement("div");
    box.id = "fx-consent";
    box.setAttribute("role", "dialog");
    var en = document.documentElement.lang === "en";
    var L = en
      ? ["Cookie settings", "May we measure visits?", "We would like to use Google Analytics to see how the site is used and make it better. No cookies are set until you accept. ",
         "May we measure visits with Google Analytics? ", "More about cookies (Swedish)", "No thanks", "Accept"]
      : ["Cookie-inställningar", "Får vi mäta besöken?", "Vi vill använda Google Analytics för att se hur sidan används och göra den bättre. Inga kakor sätts förrän du godkänner. ",
         "Får vi mäta besöken med Google Analytics? ", "Läs mer om kakor", "Nej tack", "Godkänn"];
    box.setAttribute("aria-label", L[0]);
    box.innerHTML =
      "<b>" + L[1] + "</b>" +
      "<p><span class=\"l\">" + L[2] + "</span>" +
      "<span class=\"s\">" + L[3] + "</span>" +
      "<a href=\"/integritetspolicy#kakor\">" + L[4] + "</a></p>" +
      "<div class=\"r\"><button type=\"button\" class=\"n\">" + L[5] + "</button><button type=\"button\" class=\"y\">" + L[6] + "</button></div>";
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
