// Soft "appear on scroll" for headings, cards and photos on the public pages.
// Only things that start below the screen are animated, so the top of the page (and Google's speed
// measurement) is never delayed. Nothing moves for visitors who asked their phone/computer for
// less motion, and without JavaScript or IntersectionObserver everything is simply shown.
(function () {
  if (!('IntersectionObserver' in window)) return;
  if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  var SEL = 'section h2, .svc-grid>*, .how-grid>*, .pk-grid>*, .price-grid>*, .vals>*, .tips>*, .kpis>*, ' +
            '.city-cards>*, .guide>*, .pl-grid>*, .art-img.photo, .cmp-scroll, .faq details';
  var SKIP = '.hero, header, footer, .quote, .calc, .drawer, form';
  var css = document.createElement('style');
  css.textContent = '.fx-rv{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}' +
                    '.fx-rv.fx-in{opacity:1;transform:none}' +
                    '@media print{.fx-rv{opacity:1!important;transform:none!important}}';
  document.head.appendChild(css);
  function start() {
    var vh = window.innerHeight || 800, list = [];
    document.querySelectorAll(SEL).forEach(function (el) {
      if (el.closest(SKIP) || el.classList.contains('fx-rv')) return;
      var r = el.getBoundingClientRect();
      if (!r.height || r.top < vh) return;          // already on screen at load: leave it alone
      list.push(el);
    });
    if (!list.length) return;
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (!e.isIntersecting) return;
        var el = e.target, sib = el.parentElement ? [].indexOf.call(el.parentElement.children, el) : 0;
        el.style.transitionDelay = Math.min(sib, 4) * 70 + 'ms';   // cards in a row come one after another
        el.classList.add('fx-in');
        io.unobserve(el);
        setTimeout(function () { el.style.transitionDelay = ''; }, 1200);
      });
    }, { rootMargin: '0px 0px -6% 0px' });
    list.forEach(function (el) { el.classList.add('fx-rv'); io.observe(el); });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
