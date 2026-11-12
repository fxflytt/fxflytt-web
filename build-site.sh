#!/bin/sh
# Rebuilds all pages from site-src/ and copies them to public/.
set -e
cd "$(dirname "$0")/site-src"
python3 build_cities.py >/dev/null
python3 build_pages.py >/dev/null
for f in *.html; do [ "$f" = "preview.html" ] || cp "$f" ../public/; done
cp art_*.svg ../public/
cp kubik.js ../public/
mkdir -p ../public/img && cp img/*.jpg ../public/img/
cd ..
# Chat assistant: this ONE line adds it to every page. Delete the next line to remove the assistant.
python3 add-prices.py
python3 add-chat.py
python3 add-seo.py
echo "site built"
