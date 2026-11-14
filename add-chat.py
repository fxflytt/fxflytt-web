# Adds the chat assistant line to every page in public/. Run by build-site.sh.
import glob
LINE = '<script src="/chat-widget.js" defer></script>\n'
for f in glob.glob("public/*.html"):
    if f.endswith(("admin.html", "signera.html", "arbetsorder.html")):
        continue  # booking system pages: no chat bubble
    text = open(f, encoding="utf-8").read()
    if "chat-widget.js" not in text:
        text = text.replace("</body>", LINE + "</body>", 1)
        with open(f, "w", encoding="utf-8") as out:
            out.write(text)
