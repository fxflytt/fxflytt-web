# Writes the town list used by the address field on the home page (TOWNS in index.html) to
# lib/assistant/towns.json, so the chat assistant counts distances with exactly the same towns
# and coordinates as the price calculator. Run by build-site.sh.
import re, json
s = open("index.html", encoding="utf-8").read()
towns = json.loads(re.search(r"const TOWNS=(\[\[.*?\]\]);", s, re.S).group(1))
open("../lib/assistant/towns.json", "w", encoding="utf-8").write("[\n" + ",\n".join(json.dumps(t, ensure_ascii=False) for t in towns) + "\n]\n")
print("towns", len(towns))
