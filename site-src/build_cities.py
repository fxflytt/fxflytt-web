# Builds one landing page per city from the shared parts of index.html.
# Run: python3 build_cities.py   (re-run after editing index.html or the city texts)
import re, json, html

SRC = open("index.html", encoding="utf-8").read()

def part(start, end):
    i = SRC.index(start); j = SRC.index(end, i) + len(end)
    return SRC[i:j]

css     = part("<style>", "</style>")
icons   = part('<svg width="0" height="0"', "</svg>\n")
header  = part("<header>", "</header>")
drawer  = part('<nav class="drawer"', "</nav>")
footer  = part("<footer>", "</footer>")
mbar    = part('<div class="mbar">', "</div>\n")
fonts   = part('<link rel="preconnect" href="https://fonts.googleapis.com">', 'rel="stylesheet">')

# Links on sub-pages must point back to the home page.
def homeify(s):
    s = re.sub(r'href="#(?!top"|i-)', 'href="index.html#', s)
    return s.replace('href="#top"', 'href="index.html"')
header, drawer, footer, mbar = map(homeify, (header, drawer, footer, mbar))

# Footer city names become links to the city pages.
for name, slug in [("Kungsör","kungsor"),("Örebro","orebro"),("Eskilstuna","eskilstuna"),("Västerås","vasteras"),("Katrineholm","katrineholm")]:
    footer = re.sub(rf'<li>(?:<a href="[^"]*">)?Flyttfirma {name}(?:</a>)?</li>',
                    f'<li><a href="flyttfirma-{slug}.html">Flyttfirma {name}</a></li>', footer)

extra_css = """
<style>
.c-hero{background:linear-gradient(160deg,var(--navy) 0%,#0a2032 100%);color:#fff;padding:56px 0 64px}
.c-hero h1{font-size:clamp(2rem,4.4vw,3.1rem);font-weight:800;max-width:780px}
.c-hero h1 span{color:var(--accent)}
.c-hero p{color:#c9d7e2;font-size:1.1rem;max-width:640px;margin:16px 0 26px}
.crumbs{font-size:.85rem;color:#9fb3c4;margin-bottom:14px}
.crumbs a{color:#c9d7e2;text-decoration:none}
.two{display:grid;grid-template-columns:1.2fr .8fr;gap:40px;align-items:start}
.prose p{color:var(--muted);margin-top:14px}
.prose h2{margin-bottom:4px}
.side{background:#fff;border-radius:20px;padding:26px;box-shadow:var(--shadow);position:sticky;top:90px}
.side h3{color:var(--navy);font-size:1.15rem;margin-bottom:12px}
.side .row{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid var(--line);font-size:.93rem}
.side .row b{color:var(--navy)}
.side .small{font-size:.78rem;color:var(--muted);margin:12px 0 16px}
.areas{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
.areas span{background:#fff;border:1px solid var(--line);border-radius:999px;padding:7px 14px;font-size:.88rem;font-weight:600;color:var(--navy)}
.tipbox{background:#fff4ea;border:1px solid #ffd9bd;border-radius:16px;padding:20px 22px;margin-top:22px}
.tipbox b{color:var(--navy)}
.tipbox ul{margin:10px 0 0 18px;color:var(--ink);display:grid;gap:6px;font-size:.93rem}
.other{display:flex;flex-wrap:wrap;gap:10px;margin-top:20px}
.other a{text-decoration:none}
@media(max-width:900px){.two{grid-template-columns:1fr}.side{position:static}}
</style>"""

CITIES = [
 dict(slug="kungsor", name="Kungsör", lan="Västmanlands län",
  title="Flyttfirma i Kungsör – flytt, flyttstäd & bortforsling | FX Flytt",
  desc="Flyttfirma med bas i Kungsör. FX Flytt hjälper dig med bohagsflytt, packning, flyttstäd och bortforsling i Kungsör och Valskog. Gratis offert, RUT-avdrag på fakturan.",
  h1="Flyttfirma i <span>Kungsör</span> – här finns vi",
  lead="Kungsör är vår hemmabas. Härifrån planerar vi och kör ut till hela Mälardalen – och när du flyttar inom kommunen har vi nära till dig.",
  intro=["FX Flytt har sitt kontor på Frejgatan i Kungsör. Det betyder korta avstånd när du flyttar inom orten, och att du kan nå oss på telefon eller komma förbi och prata om din flytt.",
         "Vi hjälper både dig som flyttar inom Kungsör och dig som flyttar härifrån till exempelvis Eskilstuna, Arboga, Köping eller Västerås – eller åt andra hållet. Vi tar hand om bärhjälp, lastbil, packning, montering och flyttstäd, så att du kan fokusera på det nya hemmet."],
  areas=["Kungsör centrum","Valskog","Kungsörs landsbygd","Mot Arboga","Mot Köping","Mot Eskilstuna"],
  tips=["Prata med hyresvärden eller föreningen i god tid om hiss och nycklar.","Tänk på var lastbilen kan stå nära porten – säg till oss om det är långt att bära.","Bor du på landet? Berätta om grusväg eller smal infart så planerar vi rätt bil."],
  faq=[("Har ni kontor i Kungsör?","Ja, FX Flytt finns på Frejgatan 9B i Kungsör. Ring gärna innan du kommer förbi så att någon är på plats."),
       ("Flyttar ni från Kungsör till andra orter?","Ja. Vi flyttar dagligen i Mälardalen och Örebro län, och även längre sträckor i hela Sverige."),
       ("Hjälper ni till med flyttstäd i Kungsör?","Ja, flyttstäd kan bokas tillsammans med flytten eller separat. RUT-avdraget dras direkt på fakturan.")]),
 dict(slug="orebro", name="Örebro", lan="Örebro län",
  title="Flyttfirma i Örebro – trygg flytt & flyttstäd | FX Flytt",
  desc="Ska du flytta i Örebro? FX Flytt hjälper dig med bohagsflytt, packning, montering, flyttstäd och bortforsling i hela Örebro. Gratis offert och RUT-avdrag direkt på fakturan.",
  h1="Flyttfirma i <span>Örebro</span>",
  lead="Från lägenheten i centrum till villan i ytterområdet – vi planerar din flytt i Örebro så att den blir enkel, trygg och utan överraskningar.",
  intro=["Örebro är en stad med många flerfamiljshus, studentbostäder och villaområden. Varje flytt är olika: ibland är det trappor utan hiss, ibland lång bärsträcka från parkeringen. Därför frågar vi om våningsplan, hiss och avstånd i förväg, så att rätt team och rätt bil kommer på flyttdagen.",
         "Vi hjälper privatpersoner, studenter och företag i Örebro – både när du flyttar inom staden och när du flyttar till eller från Örebro, till exempel till Kumla, Hallsberg, Arboga eller Mälardalen."],
  areas=["Centrum","Väster","Öster","Adolfsberg","Brickebacken","Varberga","Vivalla","Baronbackarna","Mosås","Lillån","Rynninge","Tybble","Sörbyängen","Hjärsta","Markbacken"],
  tips=["Studentbostad? Kolla med hyresvärden när du får nycklar och när du måste lämna – det styr flyttdagen.","Många hus i centrum har begränsad parkering. Berätta hur nära porten lastbilen kan stå.","Flyttar många samtidigt i slutet av månaden – boka tidigt eller välj ett flexibelt datum."],
  faq=[("Flyttar ni i hela Örebro?","Ja, i alla stadsdelar och i kranskommuner som Kumla och Hallsberg."),
       ("Hjälper ni studenter i Örebro?","Ja. Mindre flyttar går ofta snabbt med två flyttare och en lastbil – fyll i formuläret så får du ett pris."),
       ("Kan ni flytta från Örebro till Mälardalen?","Ja, vi kör regelbundet mellan Örebro och orter som Kungsör, Arboga, Eskilstuna och Västerås.")]),
 dict(slug="eskilstuna", name="Eskilstuna", lan="Södermanlands län",
  title="Flyttfirma i Eskilstuna – flytthjälp & flyttstäd | FX Flytt",
  desc="Flyttfirma i Eskilstuna. FX Flytt hjälper dig med bohagsflytt, packning, montering, flyttstäd och bortforsling i Eskilstuna och Torshälla. Gratis offert, RUT-avdrag direkt.",
  h1="Flyttfirma i <span>Eskilstuna</span>",
  lead="Eskilstuna ligger nära vår bas i Kungsör. Vi hjälper dig med hela flytten – från första kartongen till nycklarna i nya hemmet.",
  intro=["Eskilstuna har allt från höghusområden till villakvarter och Torshälla med sina äldre hus. Vi anpassar bemanning och tid efter hur din bostad ser ut, och berättar i offerten vad som ingår.",
         "Vi flyttar inom Eskilstuna och mellan Eskilstuna och andra orter, till exempel Kungsör, Strängnäs, Västerås och Katrineholm. Behöver du hjälp med flyttstäd eller att bli av med gamla möbler ordnar vi det i samma bokning."],
  areas=["Centrum","Fröslunda","Skiftinge","Lagersberg","Råbergstorp","Årby","Slagsta","Gredby","Nyfors","Torshälla","Hällbybrunn","Kjula"],
  tips=["Höghus med hiss? Kolla om hissen behöver bokas hos hyresvärden på flyttdagen.","Ska du lämna en hyresrätt – boka flyttstäd i god tid före besiktningen.","Gamla möbler kan vi ta med till återvinning så att du slipper en extra tur."],
  faq=[("Flyttar ni även i Torshälla?","Ja, Torshälla och övriga delar av Eskilstuna kommun ingår i vårt område."),
       ("Hur snabbt kan ni komma?","Det beror på kalendern. Fyll i formuläret eller ring oss så ser vi vilka dagar som är lediga."),
       ("Kan jag boka flyttstäd i Eskilstuna utan flytt?","Ja, flyttstäd kan bokas separat. RUT-avdraget dras direkt på fakturan.")]),
 dict(slug="vasteras", name="Västerås", lan="Västmanlands län",
  title="Flyttfirma i Västerås – bohagsflytt & flyttstäd | FX Flytt",
  desc="Flyttfirma i Västerås. FX Flytt hjälper dig med flytt av lägenhet, villa och kontor, packning, montering, flyttstäd och bortforsling. Gratis offert, RUT-avdrag direkt.",
  h1="Flyttfirma i <span>Västerås</span>",
  lead="Ska du flytta i Västerås eller till Västerås? Vi planerar flytten tillsammans med dig och ger dig ett tydligt pris innan vi börjar.",
  intro=["Västerås är en stor stad med många olika boendeformer – från lägenheter i centrum till villor i ytterområdena. Vi frågar om våning, hiss och bärsträcka för att kunna skicka rätt antal flyttare och rätt bil.",
         "Vi hjälper både privatpersoner och företag. Flyttar du kontoret kan vi göra det på tider som stör verksamheten så lite som möjligt – berätta vad som passar er."],
  areas=["Centrum","Vallby","Bäckby","Råby","Hammarby","Pettersberg","Malmaberg","Gideonsberg","Önsta-Gryta","Haga","Bjurhovda","Erikslund","Skultuna","Dingtuna","Irsta"],
  tips=["Bor du i centrum – tänk på parkering för lastbilen och berätta om avståndet till porten.","Kontorsflytt? Märk alla kartonger med rum och skrivbord så går uppackningen snabbt.","Rensa innan flytten – mindre att bära betyder lägre pris."],
  faq=[("Gör ni kontorsflytt i Västerås?","Ja, vi flyttar kontor och lokaler. Berätta om tider och omfattning så får ni en offert."),
       ("Flyttar ni till Västerås från andra orter?","Ja, till exempel från Kungsör, Köping, Arboga, Eskilstuna och Örebro."),
       ("Ingår packmaterial?","Vid packning per timme ingår material. Kartonger kan du köpa (50 st, 2 000 kr) eller hyra (50 st, 750 kr) – leverans ingår.")]),
 dict(slug="katrineholm", name="Katrineholm", lan="Södermanlands län",
  title="Flyttfirma i Katrineholm – flytt & flyttstäd | FX Flytt",
  desc="Flyttfirma i Katrineholm. FX Flytt hjälper dig med bohagsflytt, packning, montering, flyttstäd och bortforsling i Katrineholm med omnejd. Gratis offert, RUT-avdrag direkt.",
  h1="Flyttfirma i <span>Katrineholm</span>",
  lead="Vi hjälper dig att flytta i Katrineholm och omnejd – med tydligt pris, en fast kontaktperson och hjälp med allt från packning till flyttstäd.",
  intro=["Katrineholm har både stadskärna och landsbygd med mindre orter runt omkring. Flyttar du till eller från landet planerar vi tid och fordon efter vägar och infarter, så att allt går smidigt på flyttdagen.",
         "Vi flyttar inom Katrineholm och mellan Katrineholm och orter som Flen, Vingåker, Eskilstuna, Kungsör och Norrköping."],
  areas=["Katrineholm centrum","Valla","Forssjö","Björkvik","Sköldinge","Mot Flen","Mot Vingåker"],
  tips=["Bor du utanför tätorten – berätta om vägen fram till huset när du begär offert.","Villaflytt? Glöm inte förråd, garage och vind när du räknar volym.","Vill du bli av med saker – boka bortforsling samtidigt så sparar du en tur."],
  faq=[("Flyttar ni även på landsbygden runt Katrineholm?","Ja, både i tätorten och i mindre orter runt omkring."),
       ("Kan ni flytta från Katrineholm till Mälardalen?","Ja, vi kör regelbundet mellan Katrineholm och orter i Mälardalen och Örebro län."),
       ("Hur får jag ett pris?","Fyll i formuläret på startsidan eller ring oss – offerten är gratis och inte bindande.")]),
]

from extra_cities import EXTRA
CITIES += EXTRA

TRUCK = open("art_truck.svg", encoding="utf-8").read().strip()

from photo import photo
def CITY_PHOTO(c):
    i = [x["slug"] for x in CITIES].index(c["slug"])
    if i % 2 == 0:
        return photo("movers-truck", f"Flyttare från FX Flytt bär kartonger till flyttbilen i {c['name']}", "margin-top:26px", "center", "2576/1093")
    return photo("truck-street", f"Flyttbil från FX Flytt med flyttkartonger i {c['name']}", "margin-top:26px", "center", "2576/1093")

def city_page(c):
    others = "".join(f'<a class="city" href="flyttfirma-{o["slug"]}.html"><svg><use href="#i-pin"/></svg>{o["name"]}</a>'
                     for o in CITIES if o["slug"] != c["slug"])
    faq = "".join(f"<details{' open' if i==0 else ''}><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>"
                  for i,(q,a) in enumerate(c["faq"]))
    ld = {
      "@context":"https://schema.org","@type":"MovingCompany","name":"FX Flytt","legalName":"FX Flytt AB",
      "telephone":"+46763000723","email":"info@fxflytt.se",
      "address":{"@type":"PostalAddress","streetAddress":"Frejgatan 9B","addressLocality":"Kungsör","addressCountry":"SE"},
      "areaServed":{"@type":"City","name":c["name"]},
      "openingHoursSpecification":[]  # filled when opening hours are confirmed
    }
    ld.pop("openingHoursSpecification")
    ld_faq = {"@context":"https://schema.org","@type":"FAQPage","mainEntity":[
        {"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in c["faq"]]}
    return f"""<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(c["title"])}</title>
<meta name="description" content="{html.escape(c["desc"])}">
<meta property="og:type" content="website">
<meta property="og:title" content="{html.escape(c["title"])}">
<meta property="og:description" content="{html.escape(c["desc"])}">
<meta property="og:locale" content="sv_SE">
<!-- canonical + og:url are added when the domain is decided -->
{fonts}
{css}
{extra_css}
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
<script type="application/ld+json">{json.dumps(ld_faq, ensure_ascii=False)}</script>
</head>
<body>
{icons}
{header}
{drawer}

<section class="c-hero">
  <div class="wrap">
    <div class="crumbs"><a href="index.html">Start</a> › Flyttfirma {c["name"]}</div>
    <h1>{c["h1"]}</h1>
    <p>{c["lead"]}</p>
    <div class="hero-cta">
      <a href="index.html#offert" class="btn btn-accent">Få gratis offert</a>
      <a href="tel:+46763000723" class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.5)">Ring 076-300 07 23</a>
    </div>
  </div>
</section>

<section>
  <div class="wrap two">
    <div class="prose">
      <span class="eyebrow">Flytt i {c["name"]}</span>
      <h2>Vi gör din flytt i {c["name"]} enkel</h2>
      {"".join(f"<p>{p}</p>" for p in c["intro"])}
      <h3 style="color:var(--navy);margin-top:28px">Här hjälper vi till i {c["name"]}</h3>
      <div class="areas">{"".join(f"<span>{a}</span>" for a in c["areas"])}</div>
      {CITY_PHOTO(c)}
      <div class="tipbox"><b>Tips inför flytten i {c["name"]}</b><ul>{"".join(f"<li>{t}</li>" for t in c["tips"])}</ul></div>
    </div>
    <aside class="side">
      <h3>Priser i {c["name"]}</h3>
      <div class="row"><span>Flytt, fast pris</span><b>från 2 800 kr*</b></div>
      <div class="row"><span>Flytt per timme</span><b>från 595 kr/tim*</b></div>
      <div class="row"><span>Flyttstäd, fast pris</span><b>från 2 000 kr*</b></div>
      <p class="small">* Inkl. moms efter RUT-avdrag. Körsträcka 12 kr/km från 15 km mellan adresserna. Per timme minst 3 timmar. Premium −10 %, Deluxe −20 % på flytt och städ.</p>
      <a href="index.html#prisraknare" class="btn btn-accent" style="width:100%">Räkna ut ditt pris</a>
    </aside>
  </div>
</section>

<section style="background:#fff">
  <div class="wrap">
    <div class="center">
      <span class="eyebrow">Tjänster</span>
      <h2>Det här kan vi hjälpa dig med i {c["name"]}</h2>
    </div>
    <div class="svc-grid">
      <div class="svc"><div class="ico"><svg><use href="#i-truck"/></svg></div><h3>Bohagsflytt</h3><p>Lägenhet, villa eller radhus i {c["name"]} och till andra orter.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-spark"/></svg></div><h3>Flyttstäd</h3><p>Städning enligt checklista inför besiktningen.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-box"/></svg></div><h3>Packning</h3><p>Vi packar säkert – och packar upp om du vill.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-tool"/></svg></div><h3>Ned- & montering</h3><p>Sängar, garderober och hyllor tas isär och sätts ihop.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-office"/></svg></div><h3>Kontorsflytt</h3><p>Flytt av kontor och lokaler efter era tider.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-trash"/></svg></div><h3>Bortforsling</h3><p>Vi kör bort möbler och skräp till återvinning.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-music"/></svg></div><h3>Tunga lyft</h3><p>Piano, kassaskåp och andra tunga föremål.</p></div>
      <div class="svc"><div class="ico"><svg><use href="#i-pct"/></svg></div><h3>RUT-avdrag</h3><p>Avdraget dras direkt på fakturan – vi sköter ansökan.</p></div>
    </div>
  </div>
</section>

<section>
  <div class="wrap">
    <div class="center"><span class="eyebrow">Vanliga frågor</span><h2>Frågor om flytt i {c["name"]}</h2></div>
    <div class="faq">{faq}</div>
    <div class="center" style="margin-top:44px">
      <h3 style="color:var(--navy)">Vi flyttar även i</h3>
      <div class="cities">{others}</div>
    </div>
  </div>
</section>

<div class="band">
  <div class="wrap band-inner">
    <div><h2>Ska du flytta i {c["name"]}?</h2><p style="opacity:.92;margin-top:6px">Få en gratis och oförpliktande offert.</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="index.html#offert" class="btn">Få gratis offert</a>
      <a href="tel:+46763000723" class="btn dark">Ring 076-300 07 23</a>
    </div>
  </div>
</div>

{footer}
{mbar}
<script>
document.getElementById('yr').textContent=new Date().getFullYear();
(function(){{const b=document.getElementById('burger'),d=document.getElementById('drawer');
function set(o){{d.classList.toggle('open',o);b.classList.toggle('x',o);b.setAttribute('aria-expanded',o);document.body.classList.toggle('noscroll',o);}}
b.addEventListener('click',()=>set(!d.classList.contains('open')));
d.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>set(false)));
window.addEventListener('resize',()=>{{if(innerWidth>900)set(false);}});}})();
</script>
</body>
</html>
"""

for c in CITIES:
    open(f"flyttfirma-{c['slug']}.html", "w", encoding="utf-8").write(city_page(c))
    print("wrote", f"flyttfirma-{c['slug']}.html")

# Home page: city chips + footer become links.
home = SRC
for c in CITIES:
    home = re.sub(rf'<div class="city( home)?"><svg><use href="#i-pin"/></svg>{c["name"]}</div>',
                  lambda m, c=c: f'<a class="city{m.group(1) or ""}" href="flyttfirma-{c["slug"]}.html" style="text-decoration:none"><svg><use href="#i-pin"/></svg>{c["name"]}</a>', home)
    home = re.sub(rf'<li>(?:<a href="[^"]*">)?Flyttfirma {c["name"]}(?:</a>)?</li>',
                  f'<li><a href="flyttfirma-{c["slug"]}.html">Flyttfirma {c["name"]}</a></li>', home)
open("index.html", "w", encoding="utf-8").write(home)
print("updated index.html links")
