# Adds the "Få offert" pop-up (fx-offert.js) to every public page except the home page, which has the form itself.
# City pages pre-fill their town; service pages pre-select their service. Run by build-site.sh.
import glob, os, re, html
SKIP = {"index.html", "offert.html", "admin.html", "signera.html", "arbetsorder.html", "jobb.html"}
SVC = {"flyttstad.html": "cleaning|", "dodsbo.html": "other|", "utlandsflytt.html": "other|",
       "kontorsflytt.html": "other|", "magasinering.html": "other|", "pianoflytt.html": "other|", "flytthjalp.html": "hourly|", "bortforsling.html": "other|", "checklista-flyttstad.html": "cleaning|"}
for f in glob.glob("public/*.html"):
    name = os.path.basename(f)
    if name in SKIP:
        continue
    text = open(f, encoding="utf-8").read()
    if "fx-offert.js" in text:
        continue
    attrs = ""
    if name.startswith("flyttfirma-"):
        m = re.search(r"<h1>Flyttfirma i <span>([^<]+)</span>", text)
        if m:
            attrs += ' data-from="%s"' % html.escape(html.unescape(m.group(1)), quote=True)
    if name in SVC:
        attrs += ' data-svc="%s"' % SVC[name]
    if name == "en.html":
        attrs += ' data-lang="en"'
    text = text.replace("</body>", '<script src="/fx-offert.js"%s defer></script>\n</body>' % attrs, 1)
    open(f, "w", encoding="utf-8").write(text)
