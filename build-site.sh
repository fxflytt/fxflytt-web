#!/bin/sh
# Rebuilds all pages from site-src/ and copies them to public/.
set -e
cd "$(dirname "$0")/site-src"
python3 export_towns.py >/dev/null
python3 build_cities.py >/dev/null
python3 build_pages.py >/dev/null
for f in *.html; do [ "$f" = "preview.html" ] || cp "$f" ../public/; done
cp art_*.svg ../public/
cp kubik.js kontakt.js ortkarta.js fx-consent.js fx-offert.js offert-en.js ../public/
mkdir -p ../public/img ../public/fonts && cp img/*.jpg img/*.webp ../public/img/ && cp fonts/* ../public/fonts/
cd ..
# Chat assistant: this ONE line adds it to every page. Delete the next line to remove the assistant.
python3 add-prices.py
python3 add-price-marks.py
python3 add-chat.py
python3 add-consent.py
python3 add-offert.py
python3 add-seo.py
python3 add-version.py
# The AI team (Elsa, Maja, Oskar) reads the text of the service and terms pages from lib/assistant/sitefacts.json.
node scripts/site-facts.mjs
echo "site built"
