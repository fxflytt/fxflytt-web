# Builds a single-file PREVIEW (preview.html) for the claude.ai viewer, where links between
# separate files don't open. City pages become views switched by #stad-<slug>.
# The real site keeps separate files (better for Google).
import re

home = open("index.html", encoding="utf-8").read()
slugs = ["kungsor", "orebro", "eskilstuna", "vasteras", "katrineholm"]

def between(s, a, b):
    i = s.index(a) + len(a); j = s.index(b, i); return s[i:j]

def fix_links(s):
    s = re.sub(r'href="flyttfirma-([a-z]+)\.html"', r'href="#stad-\1"', s)
    s = re.sub(r'href="(tjanster|flyttfirma|paket|om-oss|radgivare|integritetspolicy|villkor)\.html"', r'href="#sida-\1"', s)
    s = s.replace('href="index.html#', 'href="#').replace('href="index.html"', 'href="#top"')
    return s

views, extra_css = [], ""
for sl in slugs:
    p = open(f"flyttfirma-{sl}.html", encoding="utf-8").read()
    if not extra_css:
        extra_css = re.findall(r"<style>\n\.c-hero.*?</style>", p, re.S)[0]
    body = between(p, "</nav>", "<footer>")
    views.append(f'<div class="view-city" id="view-stad-{sl}" hidden>{fix_links(body)}</div>')

page_css = ""
for pg in ["tjanster", "flyttfirma", "paket", "om-oss", "radgivare", "integritetspolicy", "villkor"]:
    p = open(f"{pg}.html", encoding="utf-8").read()
    if not page_css:
        page_css = re.findall(r"<style>\n\.p-hero.*?</style>", p, re.S)[0]
    body = between(p, "</nav>", "<footer>")
    views.append(f'<div class="view-city" id="view-sida-{pg}" hidden>{fix_links(body)}</div>')
extra_css += "\n" + page_css

head, rest = home.split("</nav>", 1)
main, tail = rest.split("<footer>", 1)
out = (head + "</nav>\n<div id=\"view-home\">" + fix_links(main) + "</div>\n" + "\n".join(views)
       + "\n<footer>" + fix_links(tail))
out = out.replace("</head>", extra_css + "\n</head>", 1)
out = fix_links(out)

router = """
<script>
(function(){
  const home=document.getElementById('view-home');
  const cities=[...document.querySelectorAll('.view-city')];
  function route(){
    const h=decodeURIComponent(location.hash.slice(1));
    let view=document.getElementById('view-'+h), el=null;
    if(!view && h){ el=document.getElementById(h); view=el ? el.closest('.view-city,#view-home') : null; }
    if(!view) view=home;
    home.hidden=(view!==home);
    cities.forEach(v=>v.hidden=(v!==view));
    if(el) setTimeout(()=>el.scrollIntoView({behavior:'smooth'}),30); else window.scrollTo(0,0);
  }
  window.addEventListener('hashchange',route); route();
})();
</script>
</body>"""
# Give every illustration its own gradient ids (a repeated id inside a hidden block breaks the colours).
_n = [0]
def _uniq(m):
    _n[0] += 1; blk = m.group(0)
    for gid in ("tsky", "tbody"):
        blk = blk.replace(f'id="{gid}"', f'id="{gid}{_n[0]}"').replace(f'url(#{gid})', f'url(#{gid}{_n[0]})')
    return blk
out = re.sub(r'<svg viewBox="0 0 640 360".*?</svg>', _uniq, out, flags=re.S)
out = out.replace("</body>", router, 1)
open("preview.html", "w", encoding="utf-8").write(out)
print("preview.html written,", len(out), "bytes")
