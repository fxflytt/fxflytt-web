# Marks every price on the public pages so /fx-prices.js can show the price list in use
# (the owner can change prices in admin → Inställningar → Priser without a new build).
#   <span data-fxp="h2">595</span>   one value       (keys below)
#   <option data-fxt="Köpa – {boxbuy} kr">           text inside <option>, where a <span> is not allowed
# The numbers written in the HTML stay as they are, so the pages also work without JavaScript.
# Run by build-site.sh after the pages are built. Prints prices it could not classify – check those.
import glob, json, os, re

P = json.load(open("lib/pricing/prices.json", encoding="utf-8"))
PRIVATE = {"admin.html", "signera.html", "arbetsorder.html"}
km = P["km"]["pricePerKm"]
VAL = {  # key -> value in the baked price list
    "h2": P["hourly"]["2"], "h3": P["hourly"]["3"], "h4": P["hourly"]["4"], "minh": P["hourly"]["minHours"],
    "km": km, "kmfree": P["km"]["freeBelowKm"], "km66": 66 * km,
    "move0": P["moveFixed"][0][1], "clean0": P["cleaning"][0][1],
    "boxbuy": P["boxes"]["buy"], "boxrent": P["boxes"]["rent"],
}
# Worked examples on the pages ("60 m²: 3 950 kr · 6 345 kr …") – same formulas as lib/pricing/pricelist.js
at = lambda rows, m2: next((r[1] for r in rows if m2 <= r[0]), None)
disc = lambda base, pct: base - round(base * pct / 100)
PR, DX = P["packages"]["premium"]["discountPct"], P["packages"]["deluxe"]["discountPct"]
def per_m2(n):
    mv, cl = at(P["moveFixed"], n), at(P["cleaning"], n)
    if mv is None or cl is None: return []
    return [("mv", mv), ("cl", cl), ("pr", disc(mv + cl, PR)), ("dx3", disc(mv + cl, DX) + P["hourly"]["minHours"] * P["hourly"]["2"]), ("pk66", disc(mv + cl + 66 * km, PR))]
NUM = r"\d{1,3}(?:(?:\s|&nbsp;| | )\d{3})*"
TOKEN = re.compile(r"(<script\b.*?</script>|<style\b.*?</style>|<!--.*?-->|<[^>]+>)", re.S | re.I)
num = lambda s: int(re.sub(r"\D", "", s))
plain = lambda s: re.sub(r"&nbsp;| | ", " ", s)

def classify(v, before, after):
    b, a = re.sub(r"\s+", " ", plain(before).lower()), re.sub(r"\s+", " ", plain(after).lower())
    if re.search(r"minst $", b) and re.match(r"\s*(tim|\))", a) and v == VAL["minh"]:
        return "minh"
    if re.match(r"\s*km\b", a):
        return "kmfree" if v == VAL["kmfree"] and (b.endswith("under ") or re.match(r"\s*km eller mer", a)) else None
    if re.match(r"\s*\+", a) and re.search(r"\(\s*(\d[\d ]* \+ )?$", b):        # "(3 950 + 3 100 + 792 kr)"
        m = re.findall(r"(\d+)\s*m²", b[-80:])
        for kind, val in (per_m2(int(m[-1]))[:2] if m else []):
            if v == val:
                return f"{kind}:{m[-1]}"
        return None
    if not re.match(r"\s*kr\b", a):
        return None
    if re.match(r"\s*kr\s*/\s*tim", a):
        return {VAL["h2"]: "h2", VAL["h3"]: "h3", VAL["h4"]: "h4"}.get(v)
    if v == VAL["km"] and (re.match(r"\s*kr\s*(/\s*km|per km)", a) or b.rstrip().endswith("×")):
        return "km"
    if v == VAL["km66"] and "66 km" in b[-60:]:
        return "km66"
    if v == VAL["move0"]:
        return "move0"
    if v == VAL["boxrent"] and re.search(r"hyr", b[-40:]):
        return "boxrent"
    near = b[-45:]
    if v == VAL["boxbuy"] and re.search(r"köp", near) and not re.search(r"städ", near):
        return "boxbuy"
    if v == VAL["clean0"] and re.search(r"städ|från", b[-80:]):
        return "clean0"
    m = re.match(r"\s*kr för \d+–(\d+) m²", a)                      # "3 100 kr för 51–70 m²"
    if m and v == at(P["cleaning"], int(m.group(1))):
        return "cl:" + m.group(1)
    m = re.findall(r"(\d+)\s*m²", b[-70:])                           # nearest "60 m²" before the price
    if m:
        for kind, val in per_m2(int(m[-1])):
            if v == val:
                return f"{kind}:{m[-1]}"
    return None

def mark(html, name):
    parts = TOKEN.split(html)
    text = [(i, p) for i, p in enumerate(parts) if i % 2 == 0]
    visible = [" " + plain(re.sub(r"\s+", " ", p)) + " " for _, p in text]   # spaces: words in separate tags stay separate
    in_table = set()       # text segments inside <tbody data-fxp-table> – those tables are redrawn as a whole
    inside = False
    for i, p in enumerate(parts):
        if i % 2 == 1 and p.lower().startswith("<tbody data-fxp-table"): inside = True
        elif i % 2 == 1 and p.lower().startswith("</tbody"): inside = False
        elif i % 2 == 0 and inside: in_table.add(i)
    unknown, count = [], 0
    for t, (i, seg) in enumerate(text):
        prev_tag = parts[i - 1] if i > 0 else ""
        if prev_tag.lower().startswith(("<title", "<textarea")) or not seg.strip() or i in in_table:
            continue
        before_all = "".join(visible[max(0, t - 16):t])
        after_all = "".join(visible[t + 1:t + 4])
        in_option = prev_tag.lower().startswith("<option")
        out, pos, tmpl = [], 0, seg
        for m in re.finditer(NUM, seg):
            v = num(m.group(0))
            before = (before_all + plain(seg[:m.start()]))[-100:]
            after = (plain(seg[m.end():]) + after_all)[:40]
            key = classify(v, before, after)
            if not key:
                if re.match(r"\s*(kr|&nbsp;kr)", plain(seg[m.end():]) or after) and v in VAL.values() and v > 20:
                    unknown.append(plain(before[-40:]) + "[" + m.group(0) + "]" + after[:20])
                continue
            count += 1
            if os.environ.get("FXP_DEBUG"): print(f"  {key:8} {name}: …{before[-38:].strip()} [{m.group(0)}] {after[:14].strip()}")
            if in_option:
                tmpl = tmpl.replace(m.group(0), "{" + key + "}", 1)
            else:
                out.append(seg[pos:m.start()] + f'<span data-fxp="{key}">{m.group(0)}</span>'); pos = m.end()
        if in_option and tmpl != seg:
            parts[i - 1] = prev_tag[:-1].rstrip("/") + f' data-fxt="{tmpl.strip()}">'
        elif out:
            parts[i] = "".join(out) + seg[pos:]
    for u in unknown:
        print(f"  ? {name}: …{u.strip()}")
    return "".join(parts), count

total = 0
for f in sorted(glob.glob("public/*.html")):
    if os.path.basename(f) in PRIVATE:
        continue
    html = open(f, encoding="utf-8").read()
    if 'data-fxp="' in html:      # already marked (script run twice)
        continue
    new, n = mark(html, os.path.basename(f))
    if n and "/fx-prices.js" not in new:
        new = new.replace("</body>", '<script src="/fx-prices.js" defer></script>\n</body>', 1)
    if new != html:
        open(f, "w", encoding="utf-8").write(new)
    total += n
print(f"marked {total} prices")
