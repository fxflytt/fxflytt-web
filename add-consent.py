# Adds the cookie banner / Google Analytics loader (fx-consent.js) to every public page. Run by build-site.sh.
# GA itself is switched on by setting GA_ID in site-src/fx-consent.js.
import glob
LINE = '<script src="/fx-consent.js" defer></script>\n'
for f in glob.glob("public/*.html"):
    if f.endswith(("admin.html", "signera.html", "arbetsorder.html", "jobb.html")):
        continue  # booking system pages: no analytics
    text = open(f, encoding="utf-8").read()
    if "fx-consent.js" not in text:
        text = text.replace("</body>", LINE + "</body>", 1)
        with open(f, "w", encoding="utf-8") as out:
            out.write(text)
