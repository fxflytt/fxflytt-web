# Adds canonical URL, og:url and (home page) LocalBusiness data to every page in public/,
# and writes sitemap.xml + robots.txt. Run by build-site.sh.
import glob, json, os, datetime
BASE = "https://www.fxflytt.se"
def url_for(f):
    name = os.path.basename(f)[:-5]
    return BASE + "/" if name == "index" else f"{BASE}/{name}"
pages = sorted(glob.glob("public/*.html"))
CITIES = ["Kungsör","Örebro","Eskilstuna","Västerås","Katrineholm","Karlstad","Södertälje","Åkersberga","Norrtälje","Nyköping",
          "Norrköping","Linköping","Motala","Mjölby","Jönköping","Nässjö","Tranås","Västervik","Vimmerby","Ludvika"]
BUSINESS = {"@context": "https://schema.org", "@type": "MovingCompany", "@id": BASE + "/#foretag", "name": "FX Flytt", "legalName": "FX Flytt AB",
            "telephone": "+46763000723", "email": "info@fxflytt.se", "priceRange": "2 000–14 700 kr",
            "address": {"@type": "PostalAddress", "streetAddress": "Frejgatan 9B", "postalCode": "736 30", "addressLocality": "Kungsör", "addressCountry": "SE"},
            "openingHoursSpecification": [
                {"@type": "OpeningHoursSpecification", "dayOfWeek": ["Monday","Tuesday","Wednesday","Thursday","Friday"], "opens": "07:00", "closes": "19:00"},
                {"@type": "OpeningHoursSpecification", "dayOfWeek": "Saturday", "opens": "09:00", "closes": "17:00"}],
            "areaServed": [{"@type": "City", "name": c} for c in CITIES]}
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
        ld = BUSINESS | {"url": BASE + "/", "logo": BASE + "/icon-512.png", "image": BASE + "/og-image.png"}
        tags += '<script type="application/ld+json">' + json.dumps(ld, ensure_ascii=False) + "</script>\n"
    else:
        import re as _re
        h1 = _re.search(r"<h1[^>]*>(.*?)</h1>", s, _re.S)
        name = _re.sub(r"<[^>]+>", "", h1.group(1)).strip() if h1 else os.path.basename(f)[:-5]
        crumbs = [{"@type": "ListItem", "position": 1, "name": "Start", "item": BASE + "/"}]
        if os.path.basename(f).startswith("flyttfirma-"):
            crumbs.append({"@type": "ListItem", "position": 2, "name": "Flyttfirma", "item": BASE + "/flyttfirma"})
        crumbs.append({"@type": "ListItem", "position": len(crumbs) + 1, "name": name, "item": u})
        bc = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": crumbs}
        tags += '<script type="application/ld+json">' + json.dumps(bc, ensure_ascii=False) + "</script>\n"
    s = s.replace("</head>", tags + "</head>", 1)
    open(f, "w", encoding="utf-8").write(s)
today = datetime.date.today().isoformat()
items = "".join(f"  <url><loc>{url_for(f)}</loc><lastmod>{today}</lastmod></url>\n" for f in pages)
open("public/sitemap.xml", "w").write('<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + items + "</urlset>\n")
open("public/robots.txt", "w").write(f"User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: {BASE}/sitemap.xml\n")
