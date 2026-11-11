# Builds the five menu pages (like Movinga): tjanster, flyttfirma, paket, om-oss, radgivare.
# Shares header, menu, footer and styles with index.html. Run after editing index.html.
import re, html, json

SRC = open("index.html", encoding="utf-8").read()

def part(start, end):
    i = SRC.index(start); j = SRC.index(end, i) + len(end); return SRC[i:j]

css    = part("<style>", "</style>")
icons  = part('<svg width="0" height="0"', "</svg>\n")
header = part("<header>", "</header>")
drawer = part('<nav class="drawer"', "</nav>")
footer = part("<footer>", "</footer>")
mbar   = part('<div class="mbar">', "</div>\n")
fonts  = part('<link rel="preconnect" href="https://fonts.googleapis.com">', 'rel="stylesheet">')

def homeify(s):
    s = re.sub(r'href="#(?!top"|i-)', 'href="index.html#', s)
    return s.replace('href="#top"', 'href="index.html"')
header, drawer, footer, mbar = map(homeify, (header, drawer, footer, mbar))

PAGE_CSS = """
<style>
.p-hero{background:linear-gradient(160deg,var(--navy) 0%,#0a2032 100%);color:#fff;padding:56px 0 60px}
.p-hero h1{font-size:clamp(2rem,4.4vw,3.1rem);font-weight:800;max-width:800px}
.p-hero h1 span{color:var(--accent)}
.p-hero p{color:#c9d7e2;font-size:1.1rem;max-width:660px;margin:16px 0 26px}
.crumbs{font-size:.85rem;color:#9fb3c4;margin-bottom:14px}.crumbs a{color:#c9d7e2;text-decoration:none}
.svc-rows{display:grid;gap:18px;margin-top:36px}
.svc-row{display:grid;grid-template-columns:auto 1fr auto;gap:20px;align-items:start;background:#fff;border-radius:18px;padding:24px;border:1px solid var(--line)}
.svc-row h3{color:var(--navy);font-size:1.15rem;margin-bottom:6px}
.svc-row p{color:var(--muted);font-size:.94rem}
.svc-row ul{list-style:none;display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}
.svc-row li{font-size:.82rem;font-weight:600;background:var(--bg);border-radius:999px;padding:5px 12px;color:var(--navy)}
.svc-row .tag-rut{background:#e6f7ef;color:var(--green)}
.cmp{width:100%;border-collapse:collapse;background:#fff;border-radius:18px;overflow:hidden;box-shadow:var(--shadow);margin-top:36px;font-size:.93rem}
.cmp th,.cmp td{padding:14px 16px;border-bottom:1px solid var(--line);text-align:center}
.cmp th:first-child,.cmp td:first-child{text-align:left}
.cmp thead th{background:var(--navy);color:#fff}
.cmp thead th.hot{background:var(--accent)}
.cmp svg{width:20px;height:20px;margin:auto}
.cmp .y{color:var(--green)}.cmp .n{color:#c3ccd4}
.city-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:20px;margin-top:36px}
.city-card{display:block;text-decoration:none;background:#fff;border-radius:18px;padding:24px;border:1px solid var(--line);transition:.2s}
.city-card:hover{transform:translateY(-3px);box-shadow:var(--shadow);border-color:transparent}
.city-card h3{color:var(--navy);display:flex;align-items:center;gap:8px}
.city-card h3 svg{width:20px;height:20px;color:var(--accent)}
.city-card p{color:var(--muted);font-size:.92rem;margin-top:8px}
.city-card .go{display:inline-block;margin-top:14px;font-weight:700;color:var(--accent-d);font-size:.92rem}
.guide{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:36px}
.guide .tip{height:100%}
.rutbox{background:#fff;border-radius:20px;padding:28px;box-shadow:var(--shadow);margin-top:36px}
.rutbox h3{color:var(--navy);font-size:1.25rem;margin-bottom:8px}
.rutbox p{color:var(--muted);margin-top:8px}
.rut-ex{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:18px}
.rut-ex div{background:var(--bg);border-radius:14px;padding:16px}
.rut-ex b{display:block;color:var(--navy);font-size:1.3rem}
.rut-ex span{font-size:.82rem;color:var(--muted)}
.facts{display:grid;gap:0;background:#fff;border-radius:18px;box-shadow:var(--shadow);padding:8px 24px}
.facts div{display:flex;justify-content:space-between;gap:16px;padding:14px 0;border-bottom:1px solid var(--line);font-size:.95rem}
.facts div:last-child{border-bottom:0}
.facts span{color:var(--muted)}.facts b{color:var(--navy);text-align:right}
.guide-nav{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;margin-top:22px}
.guide-nav a{text-decoration:none;background:#fff;border:1.5px solid var(--line);border-radius:999px;padding:9px 16px;font-weight:700;font-size:.9rem;color:var(--navy)}
.guide-nav a:hover{border-color:var(--accent);color:var(--accent-d)}
.art{background:#fff;border-radius:20px;padding:30px;box-shadow:var(--shadow);margin-top:26px;scroll-margin-top:90px}
.art h2{font-size:1.5rem}
.art .sub{color:var(--muted);margin:6px 0 16px}
.art ol{padding-left:22px;display:grid;gap:12px}
.art ol li{padding-left:4px}
.art ol b{color:var(--navy)}
.art ol span{display:block;color:var(--muted);font-size:.93rem}
.boxes4{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
.boxes4 div{background:var(--bg);border-radius:14px;padding:16px}
.boxes4 b{color:var(--navy);display:block;margin-bottom:8px}
.boxes4 ul{margin-left:18px;font-size:.9rem;display:grid;gap:4px}
.ktab{width:100%;border-collapse:collapse;font-size:.95rem}
.ktab th,.ktab td{padding:12px 10px;border-bottom:1px solid var(--line);text-align:left}
.ktab th{color:var(--navy)}
.legal{max-width:820px;margin:0 auto}
.legal h2{font-size:1.3rem;margin:30px 0 8px}
.legal p,.legal li{color:var(--ink);font-size:.97rem}
.legal ul{margin:8px 0 0 20px;display:grid;gap:6px}
.legal .upd{color:var(--muted);font-size:.85rem}
@media(max-width:900px){.boxes4{grid-template-columns:1fr 1fr}}
@media(max-width:520px){.boxes4{grid-template-columns:1fr}}
@media(max-width:900px){.svc-row{grid-template-columns:1fr}.city-cards,.guide,.rut-ex{grid-template-columns:1fr}.cmp{font-size:.82rem}.cmp th,.cmp td{padding:10px 8px}}
</style>"""

MENU_SCRIPT = """<script>
document.getElementById('yr').textContent=new Date().getFullYear();
(function(){const b=document.getElementById('burger'),d=document.getElementById('drawer');
function set(o){d.classList.toggle('open',o);b.classList.toggle('x',o);b.setAttribute('aria-expanded',o);document.body.classList.toggle('noscroll',o);}
b.addEventListener('click',()=>set(!d.classList.contains('open')));
d.querySelectorAll('a').forEach(a=>a.addEventListener('click',()=>set(false)));
window.addEventListener('resize',()=>{if(innerWidth>900)set(false);});})();
</script>"""

def mark_active(block, file):
    return block.replace(f'href="{file}"', f'href="{file}" class="on" aria-current="page"') \
                .replace(f'class="item" href="{file}" class="on"', f'class="item on" href="{file}"')

def page(file, title, desc, crumb, h1, lead, body, extra_head=""):
    h = mark_active(header, file); d = mark_active(drawer, file)
    return f"""<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{html.escape(title)}</title>
<meta name="description" content="{html.escape(desc)}">
<meta property="og:type" content="website">
<meta property="og:title" content="{html.escape(title)}">
<meta property="og:description" content="{html.escape(desc)}">
<meta property="og:locale" content="sv_SE">
<!-- canonical + og:url are added when the domain is decided -->
{fonts}
{css}
{PAGE_CSS}
{extra_head}
</head>
<body>
{icons}
{h}
{d}
<section class="p-hero">
  <div class="wrap">
    <div class="crumbs"><a href="index.html">Start</a> › {crumb}</div>
    <h1>{h1}</h1>
    <p>{lead}</p>
    <div class="hero-cta">
      <a href="index.html#offert" class="btn btn-accent">Få gratis offert</a>
      <a href="tel:+46763000723" class="btn btn-ghost" style="color:#fff;border-color:rgba(255,255,255,.5)">Ring 076-300 07 23</a>
    </div>
  </div>
</section>
{body}
<div class="band">
  <div class="wrap band-inner">
    <div><h2>Redo att flytta?</h2><p style="opacity:.92;margin-top:6px">Få en gratis och oförpliktande offert.</p></div>
    <div style="display:flex;gap:10px;flex-wrap:wrap">
      <a href="index.html#offert" class="btn">Få gratis offert</a>
      <a href="tel:+46763000723" class="btn dark">Ring 076-300 07 23</a>
    </div>
  </div>
</div>
{footer}
{mbar}
{MENU_SCRIPT}
</body>
</html>
"""

chk = '<svg><use href="#i-check"/></svg>'
TRUCK = open("art_truck.svg", encoding="utf-8").read().strip()
HOME = open("art_home.svg", encoding="utf-8").read().strip()
def art(svg, style=""): return f'<div class="art-img" style="{style}">{svg}</div>'
from photo import photo
def ico(i): return f'<div class="ico"><svg><use href="#i-{i}"/></svg></div>'

# ---------------------------------------------------------------- Vår tjänst
SERVICES = [
 ("truck","Bohagsflytt","Flytt av lägenhet, villa eller radhus – inom orten eller till en annan stad. Vi bär, lastar, kör och ställer in möblerna på rätt plats.",["Bärhjälp","Lastbil med förare","Möbelskydd","RUT-avdrag"]),
 ("office","Kontorsflytt","Flytt av kontor och lokaler. Vi planerar flytten efter er verksamhet, så att ni kommer igång snabbt igen på nya adressen.",["Planering","Märkning","Kvällar/helger enligt överenskommelse"]),
 ("box","Packning & uppackning","Vi packar ditt hem med rätt material så att inget går sönder – och packar upp i nya hemmet om du vill.",["Ömtåligt packas extra","Kartonger märks per rum","RUT-avdrag"]),
 ("tool","Ned- & montering","Sängar, garderober, bord och hyllor tas isär före flytten och sätts ihop igen på plats.",["Verktyg ingår","Skruvar märks","RUT-avdrag"]),
 ("music","Piano & tunga lyft","Piano, kassaskåp och andra tunga eller otympliga föremål flyttas med rätt utrustning och tillräckligt många personer.",["Rätt utrustning","Pris enligt offert"]),
 ("spark","Flyttstäd","Grundlig städning av bostaden du lämnar, enligt checklista, så att du är redo för besiktningen.",["Kök & badrum","Fönster och balkong ingår","RUT-avdrag"]),
 ("trash","Bortforsling","Vi kör bort möbler och saker du inte vill ta med – till återvinning eller tipp.",["Sorteras rätt","Pris enligt offert"]),
 ("box","Flyttkartonger","Köp eller hyr 50 flyttkartonger av oss.",["Köpa 2 000 kr","Hyra 750 kr","Leverans ingår"]),
]
rows = "".join(f'''<div class="svc-row">{ico(i)}<div><h3>{t}</h3><p>{p}</p><ul>{"".join(f'<li class="{"tag-rut" if x=="RUT-avdrag" else ""}">{x}</li>' for x in tags)}</ul></div>
<a href="{"flyttstad.html" if t=="Flyttstäd" else "index.html#offert"}" class="btn btn-ghost" style="padding:10px 18px;font-size:.9rem">{"Läs mer" if t=="Flyttstäd" else "Boka"}</a></div>''' for i,t,p,tags in SERVICES)
tjanster = page("tjanster.html",
 "Tjänster – flytt, packning, flyttstäd & bortforsling | FX Flytt",
 "Bohagsflytt, kontorsflytt, packning, montering, pianoflytt, flyttstäd och bortforsling – fasta priser och RUT-avdrag direkt på fakturan.",
 "Vår tjänst", "Allt för din flytt – <span>från en och samma firma</span>",
 "Boka bara det du behöver, eller låt oss ta hand om hela flytten. Du får en fast kontaktperson och ett tydligt pris innan vi börjar.",
 f"""
<section>
  <div class="wrap center">
    <span class="eyebrow">Så fungerar det</span>
    <h2>Från offert till nytt hem i tre steg</h2>
    <div class="how-grid" style="text-align:left">
      <div class="how"><div class="num">1</div><h3>Begär offert</h3><p>Fyll i formuläret eller ring oss. Du får ett tydligt pris utan dolda avgifter.</p></div>
      <div class="how"><div class="num">2</div><h3>Vi planerar</h3><p>Vi går igenom datum, tillval och detaljer med dig och bokar rätt bil och rätt antal flyttare.</p></div>
      <div class="how"><div class="num">3</div><h3>Vi flyttar</h3><p>Vårt team bär, lastar, kör och ställer in allt på plats – och städar om du vill.</p></div>
    </div>
    {photo("packing", "Flyttare packar porslin i en flyttkartong", "max-width:760px;margin:40px auto 0", "center 45%")}
  </div>
</section>
<section style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Tjänster</span><h2>Våra tjänster</h2>
    <p class="lead">Tjänster märkta <b style="color:var(--green)">RUT-avdrag</b> ger avdrag på arbetskostnaden för privatpersoner.</p></div>
    <div class="svc-rows">{rows}</div>
  </div>
</section>""")

# ---------------------------------------------------------------- Flyttfirma
CITY = [("kungsor","Kungsör","Vår hemmabas. Korta avstånd och kontor på Frejgatan."),
        ("orebro","Örebro","Lägenheter, studentbostäder och villor i alla stadsdelar."),
        ("eskilstuna","Eskilstuna","Hela Eskilstuna och Torshälla – nära vår bas."),
        ("vasteras","Västerås","Privatflytt och kontorsflytt i hela Västerås."),
        ("katrineholm","Katrineholm","Tätorten och landsbygden runt Katrineholm.")]
from extra_cities import EXTRA
CITY += [(c["slug"], c["name"], c["lead"].split(". ")[0].rstrip(".") + ".") for c in EXTRA]
cards = "".join(f'<a class="city-card" href="flyttfirma-{s}.html"><h3><svg><use href="#i-pin"/></svg>Flyttfirma {n}</h3><p>{t}</p><span class="go">Läs mer →</span></a>' for s,n,t in CITY)
flyttfirma = page("flyttfirma.html",
 "Flyttfirma i Mälardalen & Örebro län | FX Flytt",
 "FX Flytt flyttar i Kungsör, Örebro, Eskilstuna, Västerås, Linköping, Norrköping, Jönköping, Karlstad och fler orter – fasta priser efter boyta.",
 "Flyttfirma", "Din flyttfirma i <span>Mälardalen och Örebro län</span>",
 "Vi utgår från Kungsör och flyttar dagligen i regionen – och längre sträckor i hela Sverige. Välj din ort och läs mer.",
 f"""
<section>
  <div class="wrap">
    <div class="center"><span class="eyebrow">Våra orter</span><h2>Här flyttar vi</h2></div>
    <div class="city-cards">{cards}
      <a class="city-card" href="index.html#offert"><h3><svg><use href="#i-truck"/></svg>Hela Sverige</h3><p>Längre flyttar mellan städer – fast pris plus 12 kr/km. Räkna ut priset direkt.</p><span class="go">Få offert →</span></a>
    </div>
  </div>
</section>
<section style="background:#fff">
  <div class="wrap about">
    <div>
      {photo("truck-street", "Flyttbil från FX Flytt på en gata med flyttkartonger", "margin-bottom:26px", "center", "2576/1093", "(max-width: 900px) 100vw, 560px")}
      <span class="eyebrow">Varför en lokal flyttfirma?</span>
      <h2>Vi känner regionen</h2>
      <p>Vi kör vägarna mellan Örebro, Kungsör, Eskilstuna, Västerås och Katrineholm hela tiden. Det gör att vi kan planera rutter och tider realistiskt – och ge dig ett pris som håller.</p>
      <p>Flyttar du mellan två av våra orter, till exempel från Örebro till Västerås, sköter vi hela flytten med samma team från start till mål.</p>
    </div>
    <div class="vals">
      <div class="val">{ico("pin")}<b>Lokalkännedom</b><span>Vi vet hur husen och parkeringarna ser ut.</span></div>
      <div class="val">{ico("user")}<b>En kontakt</b><span>Samma person hela vägen.</span></div>
      <div class="val">{ico("pct")}<b>Tydligt pris</b><span>Inga dolda avgifter.</span></div>
      <div class="val">{ico("cal")}<b>Flexibelt</b><span>Välj datum som passar dig.</span></div>
    </div>
  </div>
</section>""")

# ---------------------------------------------------------------- Våra paket
pk = part('<div class="pk-grid"', 'data-pkg="deluxe">Räkna pris</a>\n      </div>\n    </div>')
pk = pk.replace('href="#prisraknare"', 'href="index.html#prisraknare"')
prices = part('<div class="price-grid"', '<p class="note">')
prices = prices[:prices.rindex('<p class="note">')]
Y = f'<svg class="y"><use href="#i-check"/></svg>'; N = f'<svg class="n"><use href="#i-x"/></svg>'
CMP = [("Lastbil med förare",Y,Y,Y),("Bärhjälp, lastning & lossning",Y,Y,Y),("Möbelskydd",Y,Y,Y),("Personlig kontaktperson",Y,Y,Y),
       ("Flyttstäd (fönster och balkong ingår)",N,Y,Y),("Packning, ned- och montering (minst 3 tim)",N,N,Y),
       ("Rabatt på flytt, städ och körsträcka",N,"<b>10 %</b>","<b>20 %</b>")]
import json as _j
PL = _j.load(open("../lib/pricing/prices.json", encoding="utf-8"))
def _k(n): return f"{n:,}".replace(",", "\u00a0") + " kr"
def _rows(t, cars=False):
    out, lo = [], 0
    for row in t:
        rng = f"{lo}–{row[0]} m²" if lo else f"upp till {row[0]} m²"
        out.append(f"<tr><td>{rng}</td>" + (f"<td>{row[2]}</td>" if cars else "") + f"<td>{_k(row[1])}</td></tr>")
        lo = row[0] + 1
    return "".join(out)
move_tbl = _rows(PL["moveFixed"], True); clean_tbl = _rows(PL["cleaning"])
cmp = "".join(f"<tr><td>{r[0]}</td><td>{r[1]}</td><td>{r[2]}</td><td>{r[3]}</td></tr>" for r in CMP)
paket = page("paket.html",
 "Flyttpaket & priser – Bas, Premium, Deluxe | FX Flytt",
 "Jämför FX Flytts flyttpaket Bas, Premium och Deluxe. Fasta priser efter boyta, flyttstäd, timpriser och RUT-avdrag – hela prislistan.",
 "Våra paket", "Välj det paket som <span>passar din flytt</span>",
 "Fast pris efter boyta. Välj flytt, flytt + städ eller allt-i-ett – och se priset direkt.",
 f"""
<section style="background:#fff">
  <div class="wrap center">
    {photo("couple", "Glatt par i sitt nya hem bland flyttkartonger", "max-width:760px;margin:0 auto 36px", "center 40%")}
    <span class="eyebrow">Paket</span><h2>Bas, Premium eller Deluxe</h2>
    <div style="text-align:left">{pk}</div>
  </div>
</section>
<section>
  <div class="wrap">
    <div class="center"><span class="eyebrow">Jämför</span><h2>Vad ingår i paketen?</h2></div>
    <div style="overflow-x:auto"><table class="cmp"><thead><tr><th>Ingår</th><th>Bas</th><th class="hot">Premium</th><th>Deluxe</th></tr></thead><tbody>{cmp}</tbody></table></div>
  </div>
</section>
<section class="prices">
  <div class="wrap center">
    <span class="eyebrow" style="color:#ffb37a">Priser</span>
    <h2>Priser i korthet</h2>
    <p class="lead">Alla priser inkl. moms efter RUT-avdrag. RUT gäller arbetskostnaden för privatpersoner.</p>
    <div style="text-align:left">{prices}</div>
    <a href="index.html#prisraknare" class="btn btn-accent" style="margin-top:22px">Räkna ut ditt pris</a>
  </div>
</section>
<section id="prislista" style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Prislista</span><h2>Hela prislistan</h2>
      <p class="lead">Priser inkl. moms efter RUT-avdrag. Boytan avrundas uppåt till närmaste steg.</p></div>
    <div class="pl-grid">
      <div><h3>Flytt – fast pris</h3><table class="cmp"><thead><tr><th>Boyta</th><th>Flyttbilar</th><th>Pris</th></tr></thead><tbody>{move_tbl}</tbody></table>
        <p class="small">Över 240 m²: pris enligt offert. Körsträcka 12 kr/km tillkommer när avståndet mellan adresserna är 15 km eller mer. Våning och hiss påverkar inte priset.</p></div>
      <div><h3>Flyttstäd – fast pris</h3><table class="cmp"><thead><tr><th>Boyta</th><th>Pris</th></tr></thead><tbody>{clean_tbl}</tbody></table>
        <p class="small">Fönster och balkong ingår. Över 300 m²: pris enligt offert.</p></div>
    </div>
    <div class="pl-grid" style="margin-top:28px">
      <div><h3>Per timme</h3><table class="cmp"><tbody>
        <tr><td>2 personer + 1 bil</td><td>595 kr/tim</td></tr><tr><td>3 personer + 1 bil</td><td>849 kr/tim</td></tr><tr><td>4 personer + 2 bilar</td><td>1 199 kr/tim</td></tr></tbody></table>
        <p class="small">Minst 3 timmar, påbörjad timme räknas som hel. Samma pris för packning och uppackning – material ingår.</p></div>
      <div><h3>Flyttkartonger</h3><table class="cmp"><tbody>
        <tr><td>Köpa 50 st</td><td>2 000 kr</td></tr><tr><td>Hyra 50 st</td><td>750 kr</td></tr></tbody></table>
        <p class="small">Leverans ingår.</p></div>
    </div>
  </div>
</section>""", extra_head="<style>.pl-grid{display:grid;grid-template-columns:1fr 1fr;gap:28px}.pl-grid h3{color:var(--navy);margin-bottom:10px}.pl-grid .small{color:var(--muted);font-size:.88rem;margin-top:8px}@media(max-width:800px){.pl-grid{grid-template-columns:1fr}}</style>")

# ---------------------------------------------------------------- Om oss
om = page("om-oss.html",
 "Om oss – FX Flytt, flyttfirma i Kungsör",
 "FX Flytt är en flyttfirma med bas i Kungsör som hjälper privatpersoner och företag i Mälardalen och Örebro län med flytt, flyttstäd och bortforsling.",
 "Om oss", "Om <span>FX Flytt</span>",
 "FX Flytt är en flyttfirma med bas i Kungsör. Vi gör flytten enkel, trygg och tydlig.",
 f"""
<section style="background:#fff">
  <div class="wrap about">
    <div>
      {photo("movers-truck", "Flyttare från FX Flytt bär kartonger till flyttbilen", "margin-bottom:26px", "center", "2576/1093", "(max-width: 900px) 100vw, 560px")}
      <span class="eyebrow">Vilka vi är</span>
      <h2>Ett lokalt flyttföretag med fokus på service</h2>
      <p>FX Flytt hjälper privatpersoner och företag i Mälardalen och Örebro län med flytt, flyttstäd, packning och bortforsling.</p>
      <p>Vi tror på enkla priser, tydlig kommunikation och att göra det vi lovar. Därför får du en fast kontaktperson som följer din flytt från första samtalet till sista kartongen.</p>
    </div>
    <div class="vals">
      <div class="val">{ico("user")}<b>Personlig kontakt</b><span>En person som svarar på dina frågor hela vägen.</span></div>
      <div class="val">{ico("truck")}<b>Rätt utrustning</b><span>Filtar, remmar och kärror för en säker flytt.</span></div>
      <div class="val">{ico("pct")}<b>Tydliga priser</b><span>Fasta priser och RUT-avdrag direkt på fakturan.</span></div>
      <div class="val">{ico("pin")}<b>Lokalkännedom</b><span>Vi känner vägarna och orterna i regionen.</span></div>
    </div>
  </div>
</section>
<section>
  <div class="wrap center">
    <span class="eyebrow">Så arbetar vi</span>
    <h2>Vårt löfte till dig</h2>
    <div class="how-grid" style="text-align:left">
      <div class="how"><div class="num">1</div><h3>Tydligt från början</h3><p>Du vet vad som ingår och vad det kostar innan flyttdagen.</p></div>
      <div class="how"><div class="num">2</div><h3>Varsamt med dina saker</h3><p>Vi skyddar möbler, golv och trapphus under hela flytten.</p></div>
      <div class="how"><div class="num">3</div><h3>Nåbara hela vägen</h3><p>Du har en kontaktperson som svarar när du ringer.</p></div>
    </div>
  </div>
</section>
<section style="background:#fff">
  <div class="wrap contact-grid">
    <div>
      <span class="eyebrow">Företagsuppgifter</span>
      <h2>FX Flytt</h2>
      <div class="facts" style="margin-top:20px">
        <div><span>Företag</span><b>FX Flytt AB</b></div>
        <div><span>Adress</span><b>Frejgatan 9B, Kungsör</b></div>
        <div><span>Telefon</span><b><a href="tel:+46763000723" style="text-decoration:none">076-300 07 23</a></b></div>
        <div><span>E-post</span><b style="word-break:break-all">info@fxflytt.se</b></div>
        <div><span>F-skatt</span><b>Ja</b></div>
        <div><span>Trafiktillstånd</span><b>Transportstyrelsen</b></div>
        <div><span>Försäkring</span><b>Trygg-Hansa, upp till 10 milj. kr</b></div>
      </div>
    </div>
    <div class="map-card">
      <div>
        <span class="eyebrow" style="color:#ffb37a">Hitta hit</span>
        <h3>Frejgatan 9B, Kungsör</h3>
        <p style="color:#c9d7e2;margin-top:8px">Centralt mellan Eskilstuna, Västerås, Örebro och Katrineholm.</p>
      </div>
      <a class="btn btn-accent" href="https://www.google.com/maps/search/?api=1&query=Frejgatan+9B+Kungs%C3%B6r" target="_blank" rel="noopener">Öppna i Google Maps</a>
    </div>
  </div>
</section>""")

# ---------------------------------------------------------------- Rådgivare
def tip(when, title, items):
    return f'<div class="tip"><span class="when">{when}</span><h3>{title}</h3><ul>{"".join(f"<li>{chk}{i}</li>" for i in items)}</ul></div>'
radgivare = page("radgivare.html",
 "Flyttråd & checklista – så planerar du flytten | FX Flytt",
 "Checklista inför flytten, packtips och hur RUT-avdraget för flytt fungerar. Gratis flyttråd från FX Flytt.",
 "Rådgivare", "Flyttråd – <span>så blir flytten enkel</span>",
 "Vår checklista hjälper dig att göra rätt saker i rätt tid. Har du frågor? Ring oss för gratis rådgivning.",
 f"""
<section>
  <div class="wrap">
    {photo("booking", "Par planerar sin flytt vid datorn", "max-width:760px;margin:0 auto 36px", "center 30%")}
    <div class="center"><span class="eyebrow">Checklista</span><h2>Steg för steg inför flytten</h2></div>
    <div class="guide">
      {tip("6–8 veckor innan","Planera",["Säg upp din gamla bostad i tid","Begär offert och boka flyttdatum","Rensa ut det du inte vill ta med","Boka flyttstäd och bortforsling"])}
      {tip("2–4 veckor innan","Förbered",["Gör adressändring hos Skatteverket","Flytta el, internet och hemförsäkring","Börja packa saker du sällan använder","Märk kartonger med rum och innehåll"])}
      {tip("Veckan innan","Sista detaljerna",["Bekräfta tid och adresser med oss","Kolla parkering och hiss på båda adresserna","Frosta av frys och kyl dagen innan","Packa en väska med det viktigaste"])}
      {tip("Flyttdagen","Genomför",["Var på plats när flyttarna kommer","Gå igenom vad som ska med och vad som stannar","Kontrollera att inget är kvar i förråd och vind","Gå igenom bostaden innan du lämnar nycklarna"])}
    </div>
  </div>
</section>
<section style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Packtips</span><h2>Packa smart</h2></div>
    <div class="svc-grid">
      <div class="svc">{ico("box")}<h3>Tungt i små lådor</h3><p>Böcker och porslin i små kartonger, lätta saker i stora.</p></div>
      <div class="svc">{ico("spark")}<h3>Skydda ömtåligt</h3><p>Slå in glas och tallrikar var för sig och fyll tomrum.</p></div>
      <div class="svc">{ico("pin")}<h3>Märk varje låda</h3><p>Skriv rum och innehåll på sidan – inte bara på locket.</p></div>
      <div class="svc">{ico("tool")}<h3>Spara skruvarna</h3><p>Lägg skruvar i en påse och tejpa fast den på möbeln.</p></div>
    </div>
  </div>
</section>

<section style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Flyttguider</span><h2>Guider för en enklare flytt</h2>
      <div class="guide-nav">
        <a href="#guide-kok">Flytta köket</a><a href="#guide-barn">Flytta med barn</a>
        <a href="#guide-lada">Vilken låda först?</a><a href="#guide-kartonger">Hur många kartonger?</a><a href="#guide-dricks">Dricks</a>
      </div>
    </div>

    <div class="art" id="guide-kok">
      <span class="eyebrow">Guide</span><h2>Så flyttar du köket – 5 tips</h2>
      <p class="sub">Köket är ofta det rum som tar längst tid att packa. Börja i god tid.</p>
      <ol>
        <li><b>Börja med det du sällan använder</b><span>Festporslin, bakformar och extra glas kan packas flera veckor innan.</span></li>
        <li><b>Slå in varje tallrik och glas för sig</b><span>Ställ tallrikar på högkant i kartongen – de tål tryck bättre så.</span></li>
        <li><b>Använd små kartonger för tungt</b><span>Porslin och konserver blir snabbt tunga. Fyll hellre fler små lådor.</span></li>
        <li><b>Töm och frosta av kyl och frys</b><span>Gör det dagen innan och låt dörrarna stå på glänt så att det inte luktar.</span></li>
        <li><b>Packa en "första-dagen-låda"</b><span>Kaffe, några koppar, bestick, diskmedel och en kniv – så klarar du första kvällen.</span></li>
      </ol>
    </div>

    <div class="art" id="guide-barn">
      <span class="eyebrow">Guide</span><h2>Flytta med barn – 7 tips</h2>
      <p class="sub">En flytt är en stor förändring för barn. Lite planering gör det lättare för alla.</p>
      <ol>
        <li><b>Berätta i god tid</b><span>Prata om flytten tidigt och svara på frågor i lugn och ro.</span></li>
        <li><b>Låt barnen vara med och bestämma</b><span>Till exempel om färg eller möblering i det nya rummet.</span></li>
        <li><b>Besök det nya området</b><span>Gå förbi skolan, lekparken eller förskolan innan flytten.</span></li>
        <li><b>Låt barnen packa en egen låda</b><span>Med favoritsaker som de själva märker och öppnar först.</span></li>
        <li><b>Ordna barnvakt på flyttdagen</b><span>Då blir dagen tryggare för barnen och smidigare för flyttarna.</span></li>
        <li><b>Gör barnrummet klart först</b><span>Ett välbekant rum skapar trygghet redan första natten.</span></li>
        <li><b>Behåll rutinerna</b><span>Samma tider för mat och sömn som vanligt hjälper barnen att landa.</span></li>
      </ol>
    </div>

    <div class="art" id="guide-lada">
      <span class="eyebrow">Guide</span><h2>Vilken låda ska jag öppna först?</h2>
      <p class="sub">Märk några lådor med "ÖPPNA FÖRST" och packa dem sist. Det här brukar behövas första dygnet:</p>
      <div class="boxes4">
        <div><b>Kök</b><ul><li>Kaffe och te</li><li>Några tallrikar och koppar</li><li>Bestick och en kniv</li><li>Diskmedel och trasa</li></ul></div>
        <div><b>Badrum</b><ul><li>Toalettpapper</li><li>Tandborste och tandkräm</li><li>Handdukar</li><li>Mediciner</li></ul></div>
        <div><b>Sovrum</b><ul><li>Lakan och täcke</li><li>Kudde</li><li>Ombyte av kläder</li><li>Laddare</li></ul></div>
        <div><b>Övrigt</b><ul><li>Verktyg och skruvar</li><li>Glödlampor</li><li>Soppåsar</li><li>Viktiga papper och nycklar</li></ul></div>
      </div>
    </div>

    <div class="art" id="guide-kartonger">
      <span class="eyebrow">Guide</span><h2>Hur många kartonger behöver jag?</h2>
      <p class="sub">En ungefärlig tumregel. Har du mycket böcker eller prylar behöver du fler.</p>
      <div style="overflow-x:auto"><table class="ktab">
        <thead><tr><th>Boyta</th><th>Ungefär antal kartonger</th></tr></thead>
        <tbody>
          <tr><td>Under 50 m²</td><td>20–30</td></tr>
          <tr><td>50–75 m²</td><td>30–45</td></tr>
          <tr><td>75–100 m²</td><td>45–60</td></tr>
          <tr><td>100–150 m²</td><td>60–80</td></tr>
          <tr><td>150–200 m²</td><td>80–100</td></tr>
          <tr><td>Över 200 m²</td><td>100 eller fler</td></tr>
        </tbody></table></div>
      <p class="sub" style="margin-top:14px">Använd vår <a href="index.html#offert">volymräknare i offertformuläret</a> för att räkna mer exakt.</p>
    </div>

    <div class="art" id="guide-dricks">
      <span class="eyebrow">Guide</span><h2>Ska man ge dricks till flyttarna?</h2>
      <p class="sub" style="margin-bottom:0">Nej, dricks är inget krav i Sverige. Priset i offerten är det du betalar. Vill du visa uppskattning räcker det långt med kaffe och vatten under dagen – eller ett omdöme efter flytten.</p>
    </div>
  </div>
</section>
<section>
  <div class="wrap">
    <div class="rutbox">
      <span class="eyebrow">RUT-avdrag</span>
      <h3>Så fungerar RUT-avdraget vid flytt</h3>
      <p>Som privatperson kan du få RUT-avdrag på <b>arbetskostnaden</b> för flytt och flyttstäd. Lastbil, körsträcka och material ger inte avdrag.</p>
      <p>Vi drar av RUT direkt på fakturan och ansöker hos Skatteverket. Du behöver bara uppge ditt personnummer. Det slutliga avdraget beslutas av Skatteverket och beror bland annat på hur mycket avdrag du redan har använt under året.</p>
      <div class="rut-ex">
        <div><b>50 %</b><span>av arbetskostnaden</span></div>
        <div><b>75 000 kr</b><span>max per person och år (ROT och RUT tillsammans)</span></div>
        <div><b>Direkt</b><span>på fakturan – vi sköter ansökan</span></div>
      </div>
    </div>
    <div class="advisor">
      <div><h3>Prata med en flyttrådgivare</h3><p>Gratis rådgivning – vi hjälper dig att planera och hitta rätt paket.</p></div>
      <div style="display:flex;gap:10px;flex-wrap:wrap"><a href="tel:+46763000723" class="btn btn-accent">Ring 076-300 07 23</a><a href="index.html#offert" class="btn" style="background:#fff;color:var(--navy)">Få offert</a></div>
    </div>
  </div>
</section>""")


# ---------------------------------------------------------------- Integritetspolicy
integritet = page("integritetspolicy.html",
 "Integritetspolicy | FX Flytt",
 "Så behandlar FX Flytt AB dina personuppgifter enligt dataskyddsförordningen (GDPR).",
 "Integritetspolicy", "Integritetspolicy",
 "Här beskriver vi vilka personuppgifter vi samlar in, varför, hur länge vi sparar dem och vilka rättigheter du har.",
 """
<section>
  <div class="wrap legal">
    <p class="upd">Senast uppdaterad: 2026-11-10</p>

    <h2>1. Personuppgiftsansvarig</h2>
    <p>FX Flytt AB, Frejgatan 9B, Kungsör, är personuppgiftsansvarig för behandlingen av dina personuppgifter. Kontakt: info@fxflytt.se, telefon 076-300 07 23.</p>

    <h2>2. Vilka uppgifter vi samlar in</h2>
    <ul>
      <li>Namn, telefonnummer och e-postadress.</li>
      <li>Adresser du flyttar från och till, samt uppgifter om bostaden (storlek, våning, hiss, bärsträcka).</li>
      <li>Uppgifter om flytten: datum, möbellista, beräknad volym och valda tjänster.</li>
      <li>Personnummer – endast om du vill ha RUT-avdrag, eftersom det krävs för ansökan hos Skatteverket.</li>
      <li>Det du själv skriver i meddelanden till oss.</li>
    </ul>

    <h2>3. Varför vi behandlar uppgifterna och med vilken rättslig grund</h2>
    <ul>
      <li><b>För att ge dig en offert och genomföra flytten</b> – åtgärder inför och fullgörande av avtal.</li>
      <li><b>För att ansöka om RUT-avdrag och sköta bokföring</b> – rättslig förpliktelse.</li>
      <li><b>För att besvara frågor och ge kundservice</b> – berättigat intresse.</li>
    </ul>

    <h2>4. Vilka som får ta del av uppgifterna</h2>
    <ul>
      <li>Skatteverket, när vi ansöker om RUT-avdrag åt dig.</li>
      <li>Leverantörer som hjälper oss att driva webbplatsen och ta emot förfrågningar (t.ex. webbhotell och e-posttjänst). De får bara behandla uppgifterna för vår räkning.</li>
    </ul>
    <p>Vi säljer aldrig dina uppgifter.</p>

    <h2>5. Hur länge vi sparar uppgifterna</h2>
    <ul>
      <li>Offertförfrågningar som inte leder till bokning raderas senast 12 månader efter förfrågan.</li>
      <li>Uppgifter om genomförda uppdrag sparas så länge bokföringslagen kräver (sju år).</li>
      <li>Personnummer sparas bara så länge det behövs för RUT-ärendet och bokföringen.</li>
    </ul>

    <h2>6. Kakor (cookies) och tredjepartstjänster</h2>
    <p>Webbplatsen använder i dag inga kakor för spårning eller marknadsföring. Typsnitt hämtas från Google Fonts och adressförslag och karta hämtas från OpenStreetMap-tjänster, vilket innebär att din IP-adress skickas till dessa leverantörer när sidan laddas. Om vi senare inför statistik eller annonsspårning ber vi om ditt samtycke först.</p>

    <h2>7. Dina rättigheter</h2>
    <p>Du har rätt att få veta vilka uppgifter vi har om dig, få felaktiga uppgifter rättade, få uppgifter raderade när de inte längre behövs, invända mot behandling och begära att behandlingen begränsas. Kontakta oss så hjälper vi dig.</p>
    <p>Om du är missnöjd med hur vi behandlar dina uppgifter kan du lämna klagomål till Integritetsskyddsmyndigheten (IMY), imy.se.</p>
  </div>
</section>""")

# ---------------------------------------------------------------- Villkor
villkor = page("villkor.html",
 "Villkor för offert och bokning | FX Flytt",
 "Villkor för offerter och bokningar hos FX Flytt AB: priser, RUT-avdrag, ändring och avbokning.",
 "Villkor", "Villkor för offert och bokning",
 "Här är de viktigaste villkoren när du begär offert och bokar flytt eller flyttstäd hos FX Flytt AB.",
 """
<section>
  <div class="wrap legal">
    <p class="upd">Senast uppdaterad: 2026-11-11 (avbokning, skador och försäkring)</p>

    <h2>1. Offert</h2>
    <p>Offerten är gratis och inte bindande. Priserna i prislistan och prisräknaren är fasta priser som bygger på de uppgifter du lämnar, till exempel boyta och avstånd. Det pris som gäller är det som står i din bokningsbekräftelse.</p>

    <h2>2. Priser</h2>
    <ul>
      <li>Alla priser anges i svenska kronor inklusive moms.</li>
      <li>Fast pris gäller för den boyta kunden uppger. Vid timpris debiteras minst 3 timmar, och påbörjad timme räknas som hel.</li>
      <li>Körsträcka debiteras med 12 kr/km när avståndet mellan adresserna är 15 km eller mer. Övriga tillval enligt prislista eller offert.</li>
      <li><b>Inga dolda avgifter.</b> Vi går igenom alla detaljer med dig innan flytten. Det pris som står i din bokningsbekräftelse är det du betalar – inga extra avgifter tillkommer i efterhand.</li>
    </ul>

    <h2>3. RUT-avdrag</h2>
    <p>RUT-avdrag gäller arbetskostnaden för privatpersoner, inte lastbil, körsträcka eller material. Vi drar av den beräknade skattereduktionen direkt på fakturan och ansöker hos Skatteverket. Om Skatteverket helt eller delvis nekar avdraget, till exempel för att du redan har använt ditt utrymme för året, betalar du mellanskillnaden.</p>

    <h2>4. Ändring och avbokning</h2>
    <ul>
      <li>Ändring av datum och avbokning är <b>kostnadsfritt fram till 6 dagar före flyttdagen</b>.</li>
      <li>Avbokar du <b>5 dagar eller mindre</b> före flyttdagen debiteras <b>10 % av det bokade priset</b>.</li>
      <li>Kontakta oss på telefon 076-300 07 23 eller e-post info@fxflytt.se. Avbokningen gäller från den dag vi tar emot den.</li>
    </ul>

    <h2>5. Inför flyttdagen</h2>
    <ul>
      <li>Lämna korrekta uppgifter om bostad, våning, hiss, bärsträcka och mängd bohag. Vi använder uppgifterna för att planera rätt antal flyttare och rätt bil.</li>
      <li>Se till att det finns möjlighet att parkera lastbilen nära porten.</li>
      <li>Värdesaker, kontanter, smycken och viktiga dokument transporterar du själv.</li>
    </ul>

    <h2>6. Skador och reklamation</h2>
    <ul>
      <li>Om något går sönder eller skadas när vi flyttar, <b>ersätter vi skadan</b>.</li>
      <li>FX Flytt AB är försäkrat hos <b>Trygg-Hansa</b> med ersättning upp till <b>10 miljoner kronor</b>.</li>
      <li>Kontrollera ditt gods när flytten är klar. Upptäcker du en skada, meddela oss så snart som möjligt – helst samma dag och med bilder – så hanterar vi ärendet snabbt.</li>
    </ul>

    <h2>7. Tillstånd och försäkring</h2>
    <p>FX Flytt AB har <b>trafiktillstånd från Transportstyrelsen</b> och är <b>försäkrat hos Trygg-Hansa</b> med ersättning upp till 10 miljoner kronor.</p>

    <h2>8. Kontakt</h2>
    <p>FX Flytt AB, Frejgatan 9B, Kungsör · 076-300 07 23 · info@fxflytt.se</p>
  </div>
</section>""")

# ---------------------------------------------------------------- Flyttstäd (one page for all cities)
ALLC = [("kungsor","Kungsör"),("orebro","Örebro"),("eskilstuna","Eskilstuna"),("vasteras","Västerås"),("katrineholm","Katrineholm")] + [(c["slug"],c["name"]) for c in EXTRA]
chips = "".join(f'<a class="city" href="flyttfirma-{s}.html" style="text-decoration:none"><svg><use href="#i-pin"/></svg>{n}</a>' for s,n in ALLC)
CHECK = [
 ("Kök", ["Spis, ugn och plåtar rengörs in- och utvändigt","Kylskåp och frys rengörs (avfrostade av dig)","Skåp och lådor torkas ur","Fläkt och filter rengörs","Diskbänk, kakel och blandare"]),
 ("Badrum", ["Toalett, handfat och dusch/badkar","Kakel och fogar","Golvbrunn rensas","Speglar och skåp","Tvättmaskin och torktumlare utvändigt"]),
 ("Alla rum", ["Golv dammsugs och våttorkas","Lister, dörrar och karmar torkas","Eluttag och strömbrytare","Garderober in- och utvändigt","Element och fönsterbänkar"]),
 ("Fönster & balkong", ["Fönster putsas in- och utvändigt samt mellan glasen","Balkong städas","Ingår i priset"]),
]
checklist = "".join(tip("Ingår", t, items) for t, items in CHECK)
FAQ = [
 ("Vad kostar flyttstäd?", "Fast pris efter boyta, från 2 000 kr (upp till 30 m²) efter RUT-avdrag. Till exempel 3 100 kr för 51–70 m² och 4 000 kr för 91–100 m². Över 300 m² ger vi offert."),
 ("Hur fungerar RUT-avdraget för flyttstäd?", "Privatpersoner betalar bara halva arbetskostnaden. Vi drar av RUT direkt på fakturan och ansöker hos Skatteverket åt dig."),
 ("I vilka orter gör ni flyttstäd?", "I alla orter där vi flyttar – se listan på den här sidan. Samma fasta pris gäller i alla orter."),
 ("Blir det billigare om jag bokar flytt och städ tillsammans?", "Ja. Med Premium får du 10 % rabatt på flytt och städ, och med Deluxe 20 %."),
 ("Kan jag boka flyttstäd utan flytt?", "Ja, flyttstäd kan bokas separat eller tillsammans med flytten."),
 ("Vad behöver jag göra före städningen?", "Töm bostaden, frosta av kyl och frys och se till att vi kommer in. Berätta om det finns förråd eller balkong som ska städas."),
]
faq_html = "".join(f"<details{' open' if i==0 else ''}><summary>{html.escape(q)}</summary><p>{html.escape(a)}</p></details>" for i,(q,a) in enumerate(FAQ))
import json as _json
faq_ld = '<script type="application/ld+json">' + _json.dumps({"@context":"https://schema.org","@type":"FAQPage","mainEntity":[{"@type":"Question","name":q,"acceptedAnswer":{"@type":"Answer","text":a}} for q,a in FAQ]}, ensure_ascii=False) + '</script>'
flyttstad = page("flyttstad.html",
 "Flyttstäd med RUT-avdrag – i alla våra orter | FX Flytt",
 "Flyttstäd enligt checklista inför besiktningen – fönster och balkong ingår. Fast pris från 2 000 kr efter RUT-avdrag, samma pris i alla våra orter.",
 "Flyttstäd", "Flyttstäd – <span>redo för besiktningen</span>",
 "Vi städar bostaden du lämnar enligt en tydlig checklista. RUT-avdraget dras direkt på fakturan.",
 f"""
<section>
  <div class="wrap about">
    <div>
      {photo("cleaning", "Städare från FX Flytt putsar fönster i en tom lägenhet", "margin-bottom:26px", "62% center", "4/3", "(max-width: 900px) 100vw, 560px")}
      <span class="eyebrow">Flyttstäd</span>
      <h2>Lämna bostaden i fint skick</h2>
      <p>När du flyttar ska bostaden lämnas städad till nästa ägare eller hyresgäst. Vi gör städningen åt dig enligt en checklista som följer det hyresvärdar och mäklare brukar kräva.</p>
      <p>Du kan boka flyttstäd tillsammans med flytten – då får du 10 % rabatt med Premium eller 20 % med Deluxe – eller boka städningen separat.</p>
    </div>
    <div class="vals">
      <div class="val">{ico("pct")}<b>Från 2 000 kr</b><span>Fast pris efter boyta, efter RUT-avdrag.</span></div>
      <div class="val">{ico("spark")}<b>Checklista</b><span>Kök, badrum, alla rum och fönster.</span></div>
      <div class="val">{ico("user")}<b>En kontakt</b><span>Samma person för flytt och städ.</span></div>
      <div class="val">{ico("cal")}<b>Flexibelt</b><span>Boka dagen som passar dig.</span></div>
    </div>
  </div>
</section>
<section style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Checklista</span><h2>Det här ingår</h2></div>
    <div class="tips">{checklist}</div>
  </div>
</section>
<section>
  <div class="wrap" style="max-width:640px">
    <div class="center"><span class="eyebrow">Priser</span><h2>Fast pris efter boyta</h2><p class="lead">Inkl. moms efter RUT-avdrag. Samma pris i alla orter.</p></div>
    <table class="cmp" style="margin-top:24px"><thead><tr><th>Boyta</th><th>Pris</th></tr></thead><tbody>{clean_tbl}</tbody></table>
    <p style="color:var(--muted);font-size:.9rem;margin-top:10px">Över 300 m²: pris enligt offert. <a href="index.html#prisraknare">Räkna ut ditt pris</a></p>
  </div>
</section>
<section>
  <div class="wrap center">
    <span class="eyebrow">Orter</span><h2>Vi gör flyttstäd i alla våra orter</h2>
    <p class="lead">Välj din ort för att läsa mer om flytt där.</p>
    <div class="cities">{chips}</div>
  </div>
</section>
<section style="background:#fff">
  <div class="wrap">
    <div class="center"><span class="eyebrow">Frågor</span><h2>Vanliga frågor om flyttstäd</h2></div>
    <div class="faq">{faq_html}</div>
  </div>
</section>""", extra_head=faq_ld)

for f, s in [("flyttstad.html", flyttstad), ("tjanster.html", tjanster), ("flyttfirma.html", flyttfirma), ("paket.html", paket), ("om-oss.html", om), ("radgivare.html", radgivare), ("integritetspolicy.html", integritet), ("villkor.html", villkor)]:
    open(f, "w", encoding="utf-8").write(s); print("wrote", f)
