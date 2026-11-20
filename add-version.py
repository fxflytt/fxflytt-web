# Gives every local script on the pages a version number from its content: /kubik.js → /kubik.js?v=3f2a9c1e.
# Browsers can then keep the file for a year (next.config.ts), and a changed file gets a new number, so
# nobody is left with an old copy. Run by build-site.sh as the last step (after every file is written).
import glob, hashlib, os, re
ver = {}
def v(name):
    if name not in ver:
        p = os.path.join("public", name)
        ver[name] = hashlib.sha256(open(p, "rb").read()).hexdigest()[:8] if os.path.isfile(p) else None
    return ver[name]
n = 0
for f in glob.glob("public/*.html"):
    s = open(f, encoding="utf-8").read()
    def rep(m):
        global n
        name = m.group(2); h = v(name)
        if not h: return m.group(0)
        n += 1
        return f'{m.group(1)}/{name}?v={h}"'
    s2 = re.sub(r'(<script\b[^>]*\bsrc=")/([\w.-]+\.js)(?:\?v=[0-9a-f]+)?"', rep, s)
    if s2 != s: open(f, "w", encoding="utf-8").write(s2)
print("versioned", n, "script tags")
