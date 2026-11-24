# Adds the soft "appear on scroll" effect (fx-motion.js) to every public page. Run by build-site.sh.
# Delete the python3 add-motion.py line in build-site.sh to switch the effect off.
import glob
LINE = '<script src="/fx-motion.js" defer></script>\n'
for f in glob.glob("public/*.html"):
    if f.endswith(("admin.html", "signera.html", "arbetsorder.html", "jobb.html", "bilder.html")):
        continue  # booking system pages: no effects
    text = open(f, encoding="utf-8").read()
    if "fx-motion.js" not in text:
        text = text.replace("</body>", LINE + "</body>", 1)
        with open(f, "w", encoding="utf-8") as out:
            out.write(text)
