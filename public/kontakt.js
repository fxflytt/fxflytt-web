/* FX Flytt – snabbkontakt "Bli uppringd". Inline form in #snabbkontakt and a pop-up for any [data-callback] link. */
(function () {
  "use strict";
  var TOPICS = ["Flytt", "Flyttstäd", "Flytt + flyttstäd", "Packning / montering", "Kontorsflytt", "Bortforsling", "Magasinering", "Annat"];
  var TIMES = ["Så snart som möjligt", "Förmiddag (07–12)", "Eftermiddag (12–17)", "Kväll (17–19)"];
  var n = 0;
  function opts(a) { return a.map(function (x) { return "<option>" + x + "</option>"; }).join(""); }
  function formHtml(id) {
    return '<form class="cb-form" novalidate>' +
      '<div class="cb-grid">' +
      '<div><label class="f" for="' + id + 'n">Namn</label><input id="' + id + 'n" name="name" autocomplete="name" required maxlength="80" placeholder="För- och efternamn"></div>' +
      '<div><label class="f" for="' + id + 'p">Telefon</label><input id="' + id + 'p" name="phone" type="tel" autocomplete="tel" inputmode="tel" required maxlength="30" placeholder="07X-XXX XX XX"></div>' +
      '<div><label class="f" for="' + id + 't">Vad gäller det?</label><select id="' + id + 't" name="topic">' + opts(TOPICS) + "</select></div>" +
      '<div><label class="f" for="' + id + 'w">När passar det att vi ringer?</label><select id="' + id + 'w" name="when">' + opts(TIMES) + "</select></div>" +
      '<div class="full"><label class="f" for="' + id + 'e">E-post <small style="font-weight:500;color:var(--muted)">(valfritt)</small></label><input id="' + id + 'e" name="email" type="email" autocomplete="email" maxlength="200" placeholder="namn@mail.se"></div>' +
      '<div class="full"><label class="f" for="' + id + 'm">Meddelande <small style="font-weight:500;color:var(--muted)">(valfritt)</small></label><textarea id="' + id + 'm" name="message" maxlength="1500" rows="3" placeholder="T.ex. datum, adress eller vad du undrar över"></textarea></div>' +
      '<div class="hp" aria-hidden="true"><label for="' + id + 'h">Lämna tomt</label><input id="' + id + 'h" name="website" tabindex="-1" autocomplete="off"></div>' +
      "</div>" +
      '<p class="cb-err" role="alert" hidden></p>' +
      '<button type="submit" class="btn btn-accent cb-send">Ring mig →</button>' +
      '<p class="cb-note">Vi ringer upp dig inom 24 timmar – oftast samma dag. Brådskande? Ring <a href="tel:+46763000723">076-300 07 23</a>.</p>' +
      "</form>" +
      '<div class="cb-done" hidden><div class="cb-ok">✓</div><h3>Tack! Vi ringer upp dig.</h3><p>Vi har fått ditt nummer och hör av oss inom 24 timmar – oftast samma dag.</p></div>';
  }
  function wire(root) {
    var f = root.querySelector("form"), err = root.querySelector(".cb-err"), btn = root.querySelector(".cb-send");
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var g = function (k) { return (f.elements[k] && f.elements[k].value || "").trim(); };
      var phone = g("phone");
      if (!g("name")) { err.textContent = "Skriv ditt namn."; err.hidden = false; f.elements.name.focus(); return; }
      if (!/^[+\d][\d\s\-()]{5,19}$/.test(phone)) { err.textContent = "Skriv ett telefonnummer vi kan ringa."; err.hidden = false; f.elements.phone.focus(); return; }
      err.hidden = true; btn.disabled = true; btn.textContent = "Skickar…";
      fetch("/api/kontakt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        name: g("name"), phone: phone, email: g("email"), topic: g("topic"), when: g("when"), message: g("message"), website: g("website"),
        page: location.pathname
      }) }).then(function (r) { return r.ok ? r.json() : r.json().catch(function () { return {}; }).then(function (j) { throw new Error(j.error || "fel"); }); })
        .then(function () {
          f.hidden = true; root.querySelector(".cb-done").hidden = false;
          try { if (window.gtag) gtag("event", "generate_lead", { method: "callback" }); } catch (x) {}
        })
        .catch(function (x) {
          err.innerHTML = (x && x.message && x.message.length < 120 && !/send-failed|not-configured/.test(x.message) ? x.message + " " : "Något gick fel. ") +
            'Ring oss gärna på <a href="tel:+46763000723">076-300 07 23</a>.';
          err.hidden = false;
        })
        .then(function () { btn.disabled = false; btn.textContent = "Ring mig →"; });
    });
  }
  // Inline form(s)
  document.querySelectorAll("[data-snabbkontakt]").forEach(function (el) { el.innerHTML = formHtml("cbi" + (n++)); wire(el); });
  // Pop-up
  var dlg = null;
  function open() {
    if (!dlg) {
      dlg = document.createElement("dialog"); dlg.className = "cb-dlg"; dlg.setAttribute("aria-label", "Bli uppringd");
      dlg.innerHTML = '<button type="button" class="cb-x" aria-label="Stäng">✕</button><h2>Bli uppringd</h2><p class="cb-lead">Lämna namn och nummer – så ringer vi dig. Det tar 30 sekunder.</p>' + formHtml("cbd");
      document.body.appendChild(dlg); wire(dlg);
      dlg.querySelector(".cb-x").addEventListener("click", function () { dlg.close(); });
      dlg.addEventListener("click", function (e) { if (e.target === dlg) dlg.close(); });
    }
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
    setTimeout(function () { var i = dlg.querySelector('input[name="name"]'); if (i) i.focus(); }, 50);
  }
  document.addEventListener("click", function (e) {
    var a = e.target.closest("[data-callback]"); if (!a) return;
    e.preventDefault(); open();
  });
})();
