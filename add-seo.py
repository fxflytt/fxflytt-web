# Adds canonical URL, og:url and (home page) LocalBusiness data to every page in public/,
# and writes sitemap.xml + robots.txt. Run by build-site.sh.
import glob, json, os, datetime
BASE = "https://www.fxflytt.se"
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
    tags += ('<link rel="icon" href="/favicon.svg" type="image/svg+xml">\n<link rel="icon" href="/favicon.ico" sizes="32x32">\n'
             '<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<meta name="theme-color" content="#0d2a3f">\n'
             f'<meta property="og:image" content="{BASE}/og-image.png">\n<meta property="og:image:width" content="1200">\n<meta property="og:image:height" content="630">\n'
             '<meta property="og:image:alt" content="FX Flytt – Flytt Express">\n<meta name="twitter:card" content="summary_large_image">\n')
    if f.endswith("index.html"):
        ld = {"@context": "https://schema.org", "@type": "MovingCompany", "name": "FX Flytt AB",
              "url": BASE + "/", "logo": BASE + "/icon-512.png", "image": BASE + "/og-image.png", "telephone": "+46763000723",
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
