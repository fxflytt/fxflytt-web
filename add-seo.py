# Adds canonical URL, og:url and (home page) LocalBusiness data to every page in public/,
# and writes sitemap.xml + robots.txt. Run by build-site.sh.
import glob, json, os, datetime
BASE = "https://fxflytt.se"
def url_for(f):
    name = os.path.basename(f)[:-5]
    return BASE + "/" if name == "index" else f"{BASE}/{name}"
pages = sorted(glob.glob("public/*.html"))
for f in pages:
    s = open(f, encoding="utf-8").read()
    if 'rel="canonical"' in s:
        continue
    u = url_for(f)
    tags = f'<link rel="canonical" href="{u}">\n<meta property="og:url" content="{u}">\n<meta property="og:site_name" content="FX Flytt">\n'
    if f.endswith("index.html"):
        ld = {"@context": "https://schema.org", "@type": "MovingCompany", "name": "FX Flytt AB",
              "url": BASE + "/", "telephone": "+46763000723",
              "address": {"@type": "PostalAddress", "streetAddress": "Frejgatan 9B", "postalCode": "736 30",
                          "addressLocality": "Kungsör", "addressCountry": "SE"},
              "areaServed": ["Kungsör", "Örebro", "Eskilstuna", "Västerås", "Katrineholm"]}
        tags += '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>\n"
    s = s.replace("</head>", tags + "</head>", 1)
    open(f, "w", encoding="utf-8").write(s)
today = datetime.date.today().isoformat()
items = "".join(f"  <url><loc>{url_for(f)}</loc><lastmod>{today}</lastmod></url>\n" for f in pages)
open("public/sitemap.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + items + "</urlset>\n")
open("public/robots.txt", "w").write(f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {BASE}/sitemap.xml\n")
