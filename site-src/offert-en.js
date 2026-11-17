// English for the quote form pop-up (/offert?lang=en, opened from the English page fxflytt.se/en).
// The form itself is the Swedish home-page form; this file only translates what the visitor sees,
// also text that the form writes later (buttons, price notes, the volume calculator). What is sent
// to FX Flytt stays in Swedish, so the office reads the request as usual.
(function () {
  if (!/[?&]lang=en\b/.test(location.search)) return;
  window.FX_LANG = "en";
  document.documentElement.lang = "en";

  var T = {
    "Begär gratis offert": "Get a free quote",
    "Svar inom 24 timmar – oftast samma dag.": "Reply within 24 hours – usually the same day.",
    "Utflyttningsadress": "Moving from (address)",
    "Inflyttningsadress": "Moving to (address)",
    "Vad behöver du?": "What do you need?",
    "Bara flytt – Bas": "Move only – Bas",
    "Flytt + flyttstäd – Premium, 10 % rabatt": "Move + move-out cleaning – Premium, 10 % off",
    "Flytt + flyttstäd + packning – Deluxe, 20 % rabatt": "Move + cleaning + packing – Deluxe, 20 % off",
    "Flytt per timme": "Move by the hour",
    "Bara flyttstäd": "Move-out cleaning only",
    "Kontorsflytt, piano eller annat": "Office move, piano or other",
    "Ingår:": "Included:",
    "lastbil med förare, bärhjälp, lastning och lossning, filtar och möbelskydd. Flyttstäd och packning ingår inte.": "truck with driver, carrying, loading and unloading, blankets and furniture protection. Cleaning and packing are not included.",
    "allt i Bas + flyttstäd (fönster och balkong) med 7 dagars städgaranti.": "everything in Bas + move-out cleaning (windows and balcony) with a 7-day cleaning guarantee.",
    "allt i Premium + packning, ned- och montering (minst 3 timmar).": "everything in Premium + packing, dismantling and assembly (at least 3 hours).",
    "10 % rabatt": "10 % off", "20 % rabatt": "20 % off",
    "på flytt, städ och körsträcka.": "on the move, cleaning and driving distance.",
    "Per timme:": "By the hour:",
    "Beskriv vad du behöver i nästa steg, så återkommer vi med ett pris.": "Describe what you need in the next step, and we will get back to you with a price.",
    "Hur många timmar packning och montering?": "How many hours of packing and assembly?",
    "2 personer,": "2 people,",
    "kr/tim efter RUT. Osäker? Välj 3 – vi går igenom det med dig.": "SEK/hour after RUT. Not sure? Choose 3 – we will go through it with you.",
    "Boyta (m²)": "Floor area (m²)",
    "Önskat datum": "Preferred date",
    "Bostad": "Home",
    "1 rok": "1-room flat", "2 rok": "2-room flat", "3 rok": "3-room flat", "4 rok": "4-room flat",
    "Villa / radhus": "House / terraced house", "Kontor / lokal": "Office / premises", "Villa": "House",
    "Gamla bostaden": "Old home", "Nya bostaden": "New home",
    "Våning": "Floor", "Bottenplan": "Ground floor", "10 tr eller högre": "10th floor or higher",
    "Hiss": "Lift", "Ingen hiss": "No lift", "Liten hiss (stora möbler får inte plats)": "Small lift (large furniture does not fit)", "Stor hiss": "Large lift",
    "Hur långt från lastbilen till porten?": "How far from the truck to the door?",
    "Under 10 m": "Under 10 m", "Över 30 m": "Over 30 m",
    "Våning och hiss påverkar inte priset – vi använder uppgifterna för att skicka rätt antal flyttare.": "Floor and lift do not change the price – we use them to send the right number of movers.",
    "Tillval": "Extras",
    "Packning": "Packing", "Flyttstäd": "Move-out cleaning", "Ned-/montering": "Dismantling/assembly",
    "Flyttkartonger": "Moving boxes", "Piano / tunga föremål": "Piano / heavy items", "Bortforsling": "Waste removal",
    "Flyttkartonger (50 st, leverans ingår)": "Moving boxes (50 pcs, delivery included)",
    "Köpa –": "Buy –", "Hyra –": "Rent –", "kr": "SEK",
    "Räkna ut volym – kubikräknare (valfritt)": "Work out the volume – volume calculator (optional)",
    "Öppna kubikräknaren i helskärm ↗": "Open the volume calculator full screen (Swedish) ↗",
    "Namn": "Name", "Telefon": "Phone", "E-post": "E-mail", "(för bekräftelse)": "(for confirmation)",
    "Övrigt (valfritt)": "Anything else (optional)", "Rabattkod från en vän (valfritt)": "Discount code from a friend (optional)",
    "Lämna tomt": "Leave empty",
    "Tillbaka": "Back", "Nästa steg →": "Next step →", "Få din kostnadsfria offert →": "Get your free quote →",
    "Skicka förfrågan": "Send request", "Skickar…": "Sending…",
    "🔒 Offerten är gratis och inte bindande. Läs vår": "🔒 The quote is free and not binding. Read our",
    "integritetspolicy": "privacy policy (Swedish)",
    "Hellre prata direkt?": "Rather talk to us?", "Bli uppringd →": "Call me back →",
    "Nästan klart!": "Almost done!",
    "Skicka din förfrågan till oss via e-post – eller ring så tar vi den direkt.": "Send your request to us by e-mail – or call and we will take it directly.",
    "Skicka via e-post": "Send by e-mail", "Ring 076-300 07 23": "Call 076-300 07 23",
    "E-post: info@fxflytt.se ·": "E-mail: info@fxflytt.se ·", "Kopiera text": "Copy text",
    "Tack! Vi har fått din förfrågan": "Thank you! We have received your request",
    "Vi återkommer så snart vi kan. Brådskande? Ring oss direkt.": "We will get back to you as soon as we can. Urgent? Call us directly.",
    "Vi har skickat en bekräftelse till din e-post och återkommer inom 24 timmar. Brådskande? Ring oss direkt.": "We have sent a confirmation to your e-mail (in Swedish) and will get back to you within 24 hours. Urgent? Call us directly.",
    "Inga förslag – skriv hela adressen": "No suggestions – type the full address",
    "Ingår inte i priset:": "Not included in the price:",
    "(efter RUT)": "(after RUT)",
    "Tips:": "Tip:", "Byt till Premium": "Switch to Premium",
    "Piano / tunga föremål – pris enligt offert": "Piano / heavy items – price in the quote",
    "Bortforsling – pris enligt offert": "Waste removal – price in the quote",
    // volume calculator
    "Rensa": "Clear", "Snabbstart – fyll i en typisk bostad och justera:": "Quick start – fill in a typical home and adjust:",
    "föremål ·": "items ·", "kartonger ·": "boxes ·", "Lägg till egen sak (mått)": "Add your own item (size)", "Lägg till": "Add",
    "Tumregel: ett normalmöblerat hem tar ca 0,33 m³ per m² boyta.": "Rule of thumb: a normally furnished home takes about 0.33 m³ per m² of floor area.",
    "Vardagsrum": "Living room", "Soffa 3-sits": "3-seat sofa", "Soffa 2-sits": "2-seat sofa", "Hörnsoffa / divansoffa": "Corner sofa / chaise sofa",
    "Fåtölj": "Armchair", "Fotpall / puff": "Footstool / pouffe", "Soffbord": "Coffee table", "TV-bänk": "TV bench", "Bokhylla": "Bookcase",
    "Vägghylla": "Wall shelf", "Vitrinskåp / skänk": "Display cabinet / sideboard", "Golvlampa": "Floor lamp", "Matta": "Rug",
    "Stor växt": "Large plant", "Tavla / spegel": "Painting / mirror",
    "Sovrum": "Bedroom", "Dubbelsäng 160–180 cm": "Double bed 160–180 cm", "Enkelsäng 90 cm": "Single bed 90 cm", "Säng 120–140 cm": "Bed 120–140 cm",
    "Extra madrass / bäddmadrass": "Extra mattress / topper", "Garderob 2 dörrar": "Wardrobe, 2 doors", "Garderob 1 dörr": "Wardrobe, 1 door",
    "Byrå": "Chest of drawers", "Sängbord": "Bedside table", "Sminkbord": "Dressing table", "Helkroppsspegel": "Full-length mirror",
    "Barnrum": "Children's room", "Spjälsäng": "Cot", "Barnsäng": "Child's bed", "Våningssäng": "Bunk bed", "Skötbord": "Changing table",
    "Leksakslåda / hylla": "Toy box / shelf", "Barnskrivbord": "Child's desk",
    "Kök": "Kitchen", "Kyl/frys (hög)": "Fridge-freezer (tall)", "Kylskåp": "Fridge", "Frys": "Freezer", "Diskmaskin": "Dishwasher",
    "Spis": "Cooker", "Mikrovågsugn": "Microwave", "Köksbord": "Kitchen table", "Köksstol": "Kitchen chair", "Barstol": "Bar stool",
    "Köksskåp / skafferi": "Kitchen cabinet / pantry",
    "Matsal": "Dining room", "Matbord (6 pers)": "Dining table (6 people)", "Stort matbord (8+ pers)": "Large dining table (8+ people)",
    "Stol": "Chair", "Skänk / sideboard": "Sideboard", "Vitrinskåp": "Display cabinet",
    "Kontor": "Office", "Skrivbord": "Desk", "Kontorsstol": "Office chair", "Arkivskåp / hurts": "Filing cabinet / drawer unit",
    "Dator + skärm": "Computer + screen", "Skrivare": "Printer", "Bokhylla (stor)": "Bookcase (large)",
    "Hall": "Hallway", "Skohylla": "Shoe rack", "Hallmöbel / byrå": "Hall furniture / chest", "Klädhängare": "Clothes rack", "Spegel": "Mirror",
    "Badrum & tvätt": "Bathroom & laundry", "Tvättmaskin": "Washing machine", "Torktumlare": "Tumble dryer", "Torkskåp": "Drying cabinet",
    "Badrumsskåp": "Bathroom cabinet", "Tvättkorg": "Laundry basket",
    "Uteplats & balkong": "Patio & balcony", "Utebord": "Garden table", "Utestol": "Garden chair", "Solsäng": "Sun lounger", "Grill": "Barbecue",
    "Parasoll": "Parasol", "Blomlåda / kruka": "Planter / pot", "Utesoffa": "Garden sofa",
    "Förråd, källare & garage": "Storage, cellar & garage", "Cykel": "Bicycle", "Barncykel": "Child's bicycle", "Barnvagn": "Pram",
    "Gräsklippare": "Lawn mower", "Verktyg / verktygslåda": "Tools / toolbox", "Arbetsbänk": "Workbench", "Förrådshylla": "Storage shelf",
    "Skidor / sportutrustning": "Skis / sports gear", "Däck (4 st)": "Tyres (4)", "Resväska": "Suitcase", "Julpynt-låda": "Christmas decorations box",
    "Kartonger & säckar": "Boxes & bags", "Flyttkartong (standard)": "Moving box (standard)", "Stor kartong / garderobskartong": "Large box / wardrobe box",
    "Säck med kläder / textil": "Bag of clothes / textiles",
    "Tungt & speciellt": "Heavy & special", "Kassaskåp": "Safe", "Akvarium": "Aquarium", "Löpband": "Treadmill", "Motionscykel": "Exercise bike",
    "Motorcykel / moped": "Motorcycle / moped", "Elsparkcykel": "E-scooter", "Massagestol": "Massage chair",
    // placeholders
    "Börja skriva adress eller ort…": "Start typing an address or town…", "t.ex. 65": "e.g. 65",
    "Sök möbel, t.ex. soffa, cykel, piano…": "Search (Swedish), e.g. soffa, cykel, piano…", "Vad? t.ex. Hörnskåp": "What? e.g. corner cabinet",
    "Längd cm": "Length cm", "Bredd cm": "Width cm", "Höjd cm": "Height cm",
    "För- och efternamn": "First and last name", "namn@mail.se": "name@mail.com",
    "T.ex. antal tunga möbler, parkering, förråd…": "E.g. number of heavy items, parking, storage room… (English is fine)",
    "T.ex. ANNA-7K2Q": "E.g. ANNA-7K2Q", "Sök möbel": "Search furniture", "Ta bort": "Remove"
  };
  // Text that contains numbers from the price list or the address field
  var R = [
    [/^(\d+) timmar$/, "$1 hours"],
    [/^(\d+) tr$/, function (m, n) { return n === "1" ? "1st floor" : n === "2" ? "2nd floor" : n === "3" ? "3rd floor" : n + "th floor"; }],
    [/^ca ([\d,]+) m³$/, function (m, n) { return "approx. " + n.replace(",", ".") + " m³"; }],
    [/^Avstånd ca (\d+) km · körtid ca (.+)$/, function (m, km, t) { return "Distance approx. " + km + " km · driving time approx. " + t.replace(" tim ", " h ").replace(/ tim$/, " h"); }],
    [/^Pris med dina tillval: (.+) kr$/, "Price with your extras: $1 SEK"],
    [/^Packning – (\d+) kr\/tim \(2 pers\) efter RUT, du betalar bara för den tid det tar$/, "Packing – $1 SEK/hour (2 people) after RUT, you only pay for the time it takes"],
    [/^Ned- och montering – (\d+) kr\/tim \(2 pers\) efter RUT, du betalar bara för den tid det tar$/, "Dismantling and assembly – $1 SEK/hour (2 people) after RUT, you only pay for the time it takes"],
    [/^Flyttstäd – fast pris efter boyta, från (.+) kr efter RUT$/, "Move-out cleaning – fixed price by floor area, from $1 SEK after RUT"],
    [/^flyttstäd enligt checklista, fönster och balkong – med 7 dagars städgaranti\. Från (.+) kr efter RUT\.$/, "move-out cleaning to a checklist, windows and balcony – with a 7-day cleaning guarantee. From $1 SEK after RUT."],
    [/^2 flyttare \+ bil från (\d+) kr\/tim efter RUT, minst (\d+) timmar\.$/, "2 movers + truck from $1 SEK/hour after RUT, at least $2 hours."],
    [/^Välj Premium \(flytt \+ flyttstäd\) så sparar du (.+) kr\.$/, "Choose Premium (move + cleaning) and save $1 SEK."],
    [/^Minska (.+)$/, function (m, x) { return "Decrease " + (T[x] || x); }],
    [/^Öka (.+)$/, function (m, x) { return "Increase " + (T[x] || x); }],
    [/^Tumregel för (\d+) m²: ca (\d+) m³ för ett normalmöblerat hem\.$/, "Rule of thumb for $1 m²: approx. $2 m³ for a normally furnished home."],
    [/^Köpa – (.+) kr$/, "Buy – $1 SEK"], [/^Hyra – (.+) kr$/, "Rent – $1 SEK"],
    [/^1 flyttbil$/, "1 moving truck"], [/^(\d+) flyttbilar$/, "$1 moving trucks"],
    [/^Kopierat!$/, "Copied!"], [/^Markera texten ovan och kopiera$/, "Select the text above and copy it"],
    [/^(.+), Sverige$/, "$1, Sweden"]
  ];
  function tr(s) {
    var t = s.trim(); if (!t) return null;
    var out = T[t];
    if (out == null) for (var i = 0; i < R.length; i++) if (R[i][0].test(t)) { out = t.replace(R[i][0], R[i][1]); break; }
    if (out == null || out === t) return null;
    return s.replace(t, out);
  }
  function fixNode(n) {
    if (n.nodeType === 3) { var v = tr(n.nodeValue); if (v != null) n.nodeValue = v; return; }
    if (n.nodeType !== 1) return;
    if (n.tagName === "OPTION" && !n.hasAttribute("value")) n.setAttribute("value", n.textContent);  // keep what is sent in Swedish
    if (n.tagName === "OPTION" && !n.dataset.sv) n.dataset.sv = n.textContent;
    ["placeholder", "aria-label", "title"].forEach(function (a) { var x = n.getAttribute(a); if (x) { var y = tr(x); if (y != null) n.setAttribute(a, y); } });
    for (var c = n.firstChild; c; c = c.nextSibling) fixNode(c);
  }
  function start() {
    var root = document.querySelector(".quote") || document.body;
    fixNode(root);
    new MutationObserver(function (ms) {
      ms.forEach(function (m) {
        if (m.type === "characterData") fixNode(m.target);
        else if (m.type === "attributes") fixNode(m.target);
        else m.addedNodes.forEach(fixNode);
      });
    }).observe(root, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "aria-label"] });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
})();
