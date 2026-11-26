# Towns where FX Flytt has its own team and moving truck (owner, 2026-11-25) – and towns served by a team in a
# nearby town (Norrköping, Södertälje, Nässjö; owner 2026-11-26) – with a section about
# company/office moves and extra FAQ. Each town has its OWN wording, so the town pages do not repeat
# each other (Google ranks pages with unique text better).
#
# Facts from the owner: own team + truck in these 12 towns; company moves in all towns, any time
# (day, evening, weekend) at the same price; office furniture is taken apart and put together;
# computers, screens and printers are moved; old furniture can go to recycling.
# Business areas were checked against the towns' own planning documents; they are written as
# "vi hjälper också företag i …" (we also serve), never as "we have moved companies there".
#
# Prices in the FAQ come from lib/pricing/prices.json, so they follow the price list.
# Placeholders: {m2} {pris} {bilar} {fri} {kmpris} {tim} {min}
import json, os

_P = json.load(open(os.path.join(os.path.dirname(__file__), "..", "lib", "pricing", "prices.json"), encoding="utf-8"))
_kr = lambda n: f"{n:,}".replace(",", " ") + " kr"
_CARS = {1: "en flyttbil", 2: "två flyttbilar", 3: "tre flyttbilar", 4: "fyra flyttbilar"}

def _fill(text, m2):
    price, cars = next((r[1], r[2]) for r in _P["moveFixed"] if r[0] >= m2)
    return text.format(m2=m2, pris=_kr(price), bilar=_CARS[cars], fri=_P["km"]["freeBelowKm"],
                       kmpris=_P["km"]["pricePerKm"], tim=_kr(_P["hourly"]["2"]), min=_P["hourly"]["minHours"])

TEAM = {
 "orebro": dict(
  m2=60,
  desc="Flyttfirma i Örebro med eget team och egen flyttbil: bohagsflytt, kontorsflytt, packning, montering och flyttstäd till fast pris. RUT-avdrag på fakturan.",
  lead="Från lägenheten i centrum till kontoret eller villan i ytterområdet – vi har ett eget team och en egen flyttbil i Örebro och planerar din flytt så att den blir enkel, trygg och utan överraskningar.",
  team=["I Örebro har FX Flytt ett eget team och en egen flyttbil. Flyttarna har sin bas i staden och känner både de täta kvarteren på Väster och Öster, de stora bostadsområdena i Vivalla, Varberga och Brickebacken och villagatorna i Adolfsberg och Rynninge.",
        "Att bilen redan står i Örebro gör planeringen enklare: det blir ingen lång transport innan jobbet börjar, och det är lättare att hitta en tid som passar dig. Flyttar du vidare till Kumla, Hallsberg eller Lindesberg räknas körsträckan bara mellan din gamla och nya adress."],
  biz_h="Företagsflytt i Örebro",
  biz_intro="Örebro är ett av Sveriges viktigaste logistiknav, och här finns allt från lager och industri till kontor, butiker och universitet. Vi hjälper företag att flytta inom staden och mellan orter – och vi hjälper också företag i områden som Aspholmen, Boglundsängen och Berglunda.",
  biz=["<b>Ni bestämmer när</b> flytten sker: mitt på dagen, efter stängning eller under en helg. Tiden påverkar inte priset.",
       "<b>Kontorsmöbler, hyllsystem och arkivskåp</b> demonteras, transporteras och monteras igen på den nya adressen.",
       "<b>It-utrustning</b> som datorer, skärmar och skrivare packas separat och märks per arbetsplats.",
       "<b>Möbler som inte ska med</b> tar vi till återvinning, så att den gamla lokalen blir tom."],
  biz_outro="Företag har inte rätt till RUT-avdrag. Ni får i stället ett fast pris i en offert – berätta ungefär hur stor lokalen är och när ni vill flytta.",
  drop=["Vad kostar en flyttfirma i Örebro?", "Gör ni kontorsflytt och företagsflytt i Örebro?", "Hur snabbt kan ni komma?"],
  faq=[("Vad kostar en flyttfirma i Örebro?", "En flytt av en tvåa på {m2} m² i Örebro kostar {pris} till fast pris efter RUT-avdrag – med {bilar} och så länge avståndet mellan adresserna är under {fri} km. Längre än så tillkommer {kmpris} kr per km och flyttbil. Vill du hellre betala per timme kostar två flyttare och en bil {tim}/tim efter RUT."),
       ("Gör ni kontorsflytt och företagsflytt i Örebro?", "Ja, både kontor, butiker och lager. Vi flyttar när det passar er – dag, kväll eller helg – och priset är detsamma."),
       ("Har ni egna flyttare i Örebro?", "Ja. Vårt Örebroteam har en egen flyttbil i staden, så vi kör inte från Kungsör när du flyttar i Örebro.")]),

 "linkoping": dict(
  m2=50,
  desc="Flyttfirma i Linköping med eget team och egen flyttbil: bohagsflytt, kontorsflytt, packning, montering och flyttstäd. Gratis offert, RUT-avdrag direkt på fakturan.",
  lead="Från studentrummet i Ryd till kontoret i centrum – vi har ett eget team och en egen flyttbil i Linköping, och hjälper dig att flytta med tydligt pris och personlig kontakt.",
  team=["FX Flytt har ett eget team och en egen flyttbil i Linköping. Teamet hjälper studenter i Ryd och Lambohov, familjer i Ekholmen och Johannelund och villaägare i Hjulsbro och Malmslätt.",
        "Med bilen på plats i Linköping blir det lättare att boka en dag som passar – och det gäller även flyttar till Norrköping, Mjölby och Motala, där körsträckan räknas från din gamla till din nya adress."],
  biz_h="Flytt för företag och kontor i Linköping",
  biz_intro="Linköping är en stad med många kunskapsföretag, inte minst kring universitetet och Linköping Science Park. Vi hjälper också företag i områden som Mjärdevi, Tornby och Hackefors – med kontor, butiker och lokaler.",
  biz=["<b>Flytten görs när den stör er minst</b> – på dagen, på kvällen eller under helgen, utan tillägg för obekväma tider.",
       "<b>Skrivbord, höj- och sänkbara bord, hyllor och skåp</b> plockas isär och sätts ihop på plats.",
       "<b>Datorer, skärmar och skrivare</b> får egen packning och tydlig märkning.",
       "<b>Gamla kontorsmöbler</b> kör vi till återvinning om ni inte vill ha dem kvar."],
  biz_outro="Eftersom RUT-avdrag bara gäller privatpersoner får företag ett fast pris i en offert.",
  drop=["Vad kostar en flyttfirma i Linköping?", "Gör ni kontorsflytt och företagsflytt i Linköping?", "Hur snabbt kan ni komma?"],
  faq=[("Vad kostar en flyttfirma i Linköping?", "En lägenhet på {m2} m² kostar {pris} att flytta inom Linköping – fast pris efter RUT-avdrag, med {bilar}. Är adresserna {fri} km eller mer från varandra lägger vi till {kmpris} kr per km och bil. Timpriset börjar på {tim}/tim efter RUT, minst {min} timmar."),
       ("Gör ni kontorsflytt och företagsflytt i Linköping?", "Ja. Vi flyttar kontor och företag i Linköping, även kvällar och helger – till samma pris som på dagtid."),
       ("Hur snabbt kan ni komma?", "Vi har ett eget team och en flyttbil i Linköping. Hur snabbt vi kan komma beror på kalendern – ring oss eller fyll i formuläret.")]),

 "vasteras": dict(
  m2=70,
  team=["FX Flytt har ett eget team och en egen flyttbil med bas i Västerås. Flyttarna som kommer till dig känner staden – från gårdarna i Bäckby och Råby och trapphusen i centrum till villagatorna i Hammarby och Önsta-Gryta. Eftersom bilen redan står i Västerås blir det enklare att hitta en tid som passar.",
        "Många flyttar sker inom staden, men vi kör också vidare till Köping, Kungsör, Enköping och Eskilstuna. Då räknas körsträckan bara på avståndet mellan din gamla och nya adress – inte från vårt kontor."],
  biz_h="Flytt för företag och kontor i Västerås",
  biz_intro="Västerås har ett stort näringsliv med allt från industri och teknikföretag till kontor och butiker i centrum. Vi hjälper företag att flytta kontor, butiker och lager – och vi hjälper också företag i områden som Finnslätten, Erikslund och Kopparlunden.",
  biz=["<b>Vi flyttar när det passar er verksamhet</b> – en vardag, en kväll eller en helg. Priset är detsamma oavsett tid.",
       "<b>Arbetsplatser plockas isär och byggs ihop igen:</b> skrivbord, hyllor, förvaringsskåp och mötesbord.",
       "<b>Datorer, skärmar och skrivare</b> packas för sig och märks, så att varje arbetsplats kommer rätt.",
       "<b>Kontorsmöbler ni inte vill ha kvar</b> kör vi till återvinning."],
  biz_outro="Eftersom företag inte kan använda RUT-avdrag får ni ett fast pris i en offert. Berätta hur många arbetsplatser ni har och vilka datum som fungerar, så återkommer vi.",
  drop=["Gör ni kontorsflytt i Västerås?"],
  faq=[("Vad kostar det att flytta en trea i Västerås?", "En lägenhet på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, och då kommer vi med {bilar}. Flyttar du {fri} km eller längre – till exempel från Västerås till Köping – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Västerås, även på helger?", "Ja, vi flyttar kontor, butiker och lokaler i Västerås – en kväll eller helg kostar samma som en vardag. Berätta om omfattning och datum så får ni en offert."),
       ("Har ni flyttare på plats i Västerås?", "Ja, vi har ett eget team och en flyttbil med bas i Västerås.")]),

 "eskilstuna": dict(
  m2=80,
  team=["I Eskilstuna har vi ett eget team och en egen flyttbil. Teamet hjälper till i hela kommunen – från lägenheterna i Fröslunda, Skiftinge och Lagersberg till villorna i Gredby och Slagsta och vidare ut till Torshälla och Hällbybrunn.",
        "Eskilstuna ligger nära både Kungsör, Strängnäs och Västerås, så många flyttar här går mellan orterna. Körsträckan räknas då bara på avståndet mellan dina två adresser – inte från någon av våra baser."],
  biz_h="Företagsflytt i Eskilstuna",
  biz_intro="Eskilstuna har en lång industrihistoria och i dag ett brett näringsliv med industri, logistik, handel och kontor. Vi hjälper också företag i områden som Munktellstaden, Tuna Park och Kjula.",
  biz=["<b>Flytten planeras efter er verksamhet</b> – vi kan jobba dagtid, kvällstid eller på helgen, alltid till samma pris.",
       "<b>Vi tar isär och monterar</b> kontorsmöbler, hyllor och förvaring.",
       "<b>Datorer, skärmar och skrivare</b> packas för sig så att de klarar transporten.",
       "<b>Det ni inte vill ha med</b> kan vi köra till återvinning."],
  biz_outro="Företag får ett fast pris i en offert, eftersom RUT-avdrag inte gäller för företag.",
  drop=["Hur snabbt kan ni komma?"],
  faq=[("Vad kostar det att flytta en villa eller stor lägenhet i Eskilstuna?", "Ett hem på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, och då kommer vi med {bilar}. Är avståndet mellan adresserna {fri} km eller mer tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Eskilstuna på kvällar och helger?", "Ja, och det kostar inte mer än en flytt på dagtid."),
       ("Hur snabbt kan ni komma?", "Vårt team och vår flyttbil finns i Eskilstuna. Hur snabbt vi kan komma beror på kalendern – ring oss eller fyll i formuläret.")]),

 "uppsala": dict(
  m2=40,
  team=["FX Flytt har ett eget team och en egen flyttbil i Uppsala. Teamet hjälper studenter i Flogsta, Kåbo och Rosendal, familjer i Gottsunda, Sävja och Sunnersta och villaägare i Storvreta.",
        "Studentflyttarna gör att Uppsala har extra många flyttar runt terminsstarterna i augusti och januari. Med eget team i staden är det lättare att få en tid även då – men boka gärna i god tid. Ska du flytta vidare till Stockholm eller Enköping räknas körsträckan mellan dina två adresser."],
  biz_h="Flytt för företag och kontor i Uppsala",
  biz_intro="Uppsala har ett stort näringsliv med life science, kontor, handel och logistik. Vi hjälper också företag i områden som Boländerna, Fyrislund, Kungsängen och Librobäck.",
  biz=["<b>Vi flyttar er verksamhet när det passar</b> – dag, kväll eller helg. Det kostar lika mycket oavsett tid.",
       "<b>Kontorsmöbler och förvaring</b> monteras ned och upp igen.",
       "<b>Datorer, skärmar och skrivare</b> packas och märks per arbetsplats.",
       "<b>Möbler ni lämnar kvar</b> kan vi ta till återvinning."],
  biz_outro="Företag har inte rätt till RUT-avdrag, så ni får ett fast pris i en offert.",
  drop=[],
  faq=[("Vad kostar det att flytta en etta eller studentlägenhet i Uppsala?", "En bostad på upp till {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Är avståndet mellan adresserna {fri} km eller mer tillkommer {kmpris} kr per km. Små flyttar kan också bokas per timme från {tim}/tim efter RUT (minst {min} timmar)."),
       ("Gör ni kontorsflytt och företagsflytt i Uppsala?", "Ja, vi flyttar kontor, butiker och lokaler i Uppsala – även kvällar och helger, till samma pris."),
       ("Har ni flyttare på plats i Uppsala?", "Ja, vi har ett eget team och en flyttbil i Uppsala.")]),

 "jonkoping": dict(
  m2=90,
  team=["I Jönköping har FX Flytt ett eget team och en egen flyttbil. Teamet flyttar i hela kommunen – i centrum och på Öster och Väster, i Råslätt och Österängen och ut till Huskvarna, Bankeryd, Norrahammar och Gränna.",
        "Jönköping ligger i backar runt Vättern, och i de äldre delarna kan det vara branta gator och trånga uppfarter. Berätta hur det ser ut vid ditt hus, så planerar vi bil och bemanning efter det."],
  biz_h="Företagsflytt i Jönköping",
  biz_intro="Jönköping är en stor logistikstad med lager, industri, handel och kontor. Vi hjälper också företag i områden som Torsvik och Ljungarum och kring Science Park vid högskolan.",
  biz=["<b>Vi flyttar er när det stör verksamheten minst</b> – på dagen, på kvällen eller i helgen. Priset är detsamma.",
       "<b>Skrivbord, hyllor och arkivskåp</b> demonteras och monteras på den nya adressen.",
       "<b>Datorer, skärmar och skrivare</b> packas separat och märks.",
       "<b>Kontorsmöbler som inte ska med</b> kör vi till återvinning."],
  biz_outro="Företag får ett fast pris i en offert – RUT-avdrag gäller bara privatpersoner.",
  drop=[],
  faq=[("Vad kostar det att flytta i Jönköping?", "Ett hem på {m2} m² kostar {pris} till fast pris efter RUT-avdrag. Då kommer vi med {bilar}. Ligger adresserna {fri} km eller mer från varandra – till exempel om du flyttar från Gränna till Jönköping – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Jönköping?", "Ja, vi flyttar kontor och företag i Jönköping och Huskvarna – dag, kväll eller helg, till samma pris."),
       ("Har ni ett eget team i Jönköping?", "Ja, vi har egna flyttare och en egen flyttbil i Jönköping.")]),

 "karlstad": dict(
  m2=100,
  team=["FX Flytt har ett eget team och en egen flyttbil i Karlstad. Teamet hjälper till i hela staden – i centrum och Herrhagen, i Kronoparken nära universitetet, i Våxnäs och Rud och ut mot Skåre och Vålberg.",
        "Många som flyttar till eller från Karlstad flyttar långt, till exempel till Örebro eller Mälardalen. Då passar det bra att vi har bilar på flera orter, och körsträckan räknas bara mellan din gamla och nya adress."],
  biz_h="Flytt för företag och kontor i Karlstad",
  biz_intro="Karlstad har ett varierat näringsliv med kontor, handel, universitet och industri. Vi hjälper också företag i områden som Bergvik och Välsviken och kring Karlstad Innovation Park.",
  biz=["<b>Ni väljer tid:</b> dag, kväll eller helg. Vi tar samma pris oavsett.",
       "<b>Vi demonterar och monterar</b> kontorsmöbler, hyllor och skåp.",
       "<b>It-utrustningen</b> – datorer, skärmar och skrivare – packas för sig.",
       "<b>Gamla möbler</b> kan vi köra till återvinning."],
  biz_outro="Företag kan inte använda RUT-avdrag och får därför ett fast pris i en offert.",
  drop=[],
  faq=[("Vad kostar det att flytta ett radhus eller en villa i Karlstad?", "Ett hem på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Om avståndet mellan adresserna är {fri} km eller mer tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni företagsflytt i Karlstad?", "Ja – kontor, butiker och lokaler. Kvällar och helger kostar lika mycket som vardagar."),
       ("Har ni flyttare i Karlstad?", "Ja, vi har ett eget team och en flyttbil i Karlstad.")]),

 "kungsor": dict(
  m2=120,
  team=["Kungsör är vår hemort – här har FX Flytt sitt kontor på Drottninggatan, ett eget team och flyttbilar. Vi flyttar i centrum och i Valskog, på landsbygden runt Kungsör och vidare mot Arboga, Köping och Eskilstuna.",
        "Eftersom vi utgår härifrån känner vi orten väl, från lägenheterna nära centrum till gårdarna utanför tätorten. Bor du på landet – berätta om infarten och var bilen kan stå, så planerar vi rätt."],
  biz_h="Företagsflytt i Kungsör",
  biz_intro="I Kungsör finns industriföretag, verkstäder, kontor och butiker. Vi hjälper dem att flytta inom orten och till grannorterna.",
  biz=["<b>Flytten sker när det passar er</b> – dag, kväll eller helg, till samma pris.",
       "<b>Vi monterar ned och upp</b> möbler, hyllor och förvaring.",
       "<b>Datorer, skärmar och skrivare</b> packas och märks.",
       "<b>Det ni inte vill ha med</b> kan vi köra till återvinning."],
  biz_outro="Företag får ett fast pris i en offert, eftersom RUT-avdrag bara gäller privatpersoner.",
  drop=[],
  faq=[("Vad kostar det att flytta en villa i Kungsör?", "En villa på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Flyttar du inom Kungsör är körsträckan oftast under {fri} km och kostar då ingenting – längre flyttar kostar {kmpris} kr per km och flyttbil."),
       ("Gör ni företagsflytt i Kungsör?", "Ja, vi flyttar kontor, butiker och verkstäder – dag, kväll eller helg till samma pris.")]),

 "strangnas": dict(
  m2=110,
  team=["I Strängnäs har vi ett eget team och en egen flyttbil. Vi flyttar i staden och i Finninge, och i hela kommunen – Mariefred, Stallarholmen, Åkers styckebruk och Läggesta.",
        "Strängnäs ligger vid Mälaren och har bra förbindelser med både Stockholm och Eskilstuna, så många flyttar hit eller härifrån längre sträckor. Körsträckan räknas bara mellan din gamla och nya adress.",
        "I Mariefred finns många äldre trähus och smala gator kring centrum, och i Strängnäs gamla stadskärna runt domkyrkan är det likadant. Berätta hur nära porten flyttbilen kan stå, så räknar vi med rätt bärsträcka och rätt antal flyttare."],
  biz_h="Flytt för företag och kontor i Strängnäs",
  biz_intro="Vi hjälper kontor, butiker och mindre företag i Strängnäs och Mariefred – och vi hjälper också företag i verksamhetsområden som Storängen.",
  biz=["<b>Vi kan flytta dagtid, kvällstid eller på helgen</b> – priset är detsamma.",
       "<b>Skrivbord, hyllor och förvaring</b> tas isär och sätts ihop igen.",
       "<b>Datorer, skärmar och skrivare</b> packas separat.",
       "<b>Gamla möbler</b> kan följa med till återvinning."],
  biz_outro="RUT-avdrag gäller inte för företag, så ni får ett fast pris i en offert.",
  drop=[],
  faq=[("Vad kostar det att flytta i Strängnäs?", "Ett hem på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Flyttar du till exempel mellan Strängnäs och Mariefred och avståndet är {fri} km eller mer tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Strängnäs?", "Ja, både i Strängnäs och Mariefred – dag, kväll eller helg till samma pris."),
       ("Har ni flyttare i Strängnäs?", "Ja, vi har ett eget team och en flyttbil i Strängnäs.")]),

 "enkoping": dict(
  m2=30,
  team=["FX Flytt har ett eget team och en egen flyttbil i Enköping. Vi flyttar i centrum, i Korsängen och Romberga och ute i Grillby, Örsundsbro och Fjärdhundra.",
        "Enköping ligger mitt emellan Västerås och Uppsala och nära Stockholm, så många flyttar går mellan städerna. Körsträckan räknas bara mellan din gamla och nya adress – inte från vår bas.",
        "Bor du i Grillby, Örsundsbro eller Fjärdhundra är det ofta villa eller gård med förråd och uthus. Gå igenom alla utrymmen innan du begär offert – eller använd kubikräknaren – så blir priset rätt från början. Flyttstäd kan du boka samtidigt."],
  biz_h="Företagsflytt i Enköping",
  biz_intro="I Enköping finns företag inom handel, service, industri och de gröna näringarna. Vi hjälper också företag i områden som Romberga och Myran.",
  biz=["<b>Flytten görs när det passar er</b> – vardag, kväll eller helg, till samma pris.",
       "<b>Vi tar isär och monterar</b> möbler, hyllor och skåp.",
       "<b>Datorer, skärmar och skrivare</b> packas för sig och märks.",
       "<b>Det som inte ska med</b> kan vi köra till återvinning."],
  biz_outro="Företag får ett fast pris i en offert – RUT-avdrag gäller inte för företag.",
  drop=[],
  faq=[("Vad kostar det att flytta en etta i Enköping?", "En etta på upp till {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Är avståndet mellan adresserna {fri} km eller mer tillkommer {kmpris} kr per km. Du kan också boka per timme från {tim}/tim efter RUT."),
       ("Gör ni kontorsflytt i Enköping?", "Ja, vi flyttar kontor och lokaler i Enköping – dag, kväll eller helg till samma pris."),
       ("Har ni ett eget team i Enköping?", "Ja, vi har egna flyttare och en flyttbil i Enköping. Det gör det enkelt att hjälpa till även med mindre flyttar inne i staden, till exempel från en etta i centrum till en lägenhet i Korsängen.")]),

 "motala": dict(
  m2=140,
  team=["I Motala har FX Flytt ett eget team och en egen flyttbil. Vi flyttar i centrum och på Väster, i Charlottenborg, Råssnäs och Ekön och ute i Borensberg och Fornåsa.",
        "Motala har Vättern på ena sidan och Göta kanal genom staden, och här finns många villor och hus nära vattnet. Stora hus betyder ofta mycket i förråd, garage och vind – räkna med allt när du uppskattar volymen, eller använd vår kubikräknare.",
        "Flyttar du från ett hus i Motala kan vi också städa den gamla bostaden, så att du slipper boka en annan firma. Har du saker som inte ska med – gamla möbler eller vitvaror – kan vi ta dem till återvinning i samband med flytten."],
  biz_h="Flytt för företag och kontor i Motala",
  biz_intro="Motala har en lång industritradition och i dag verkstäder, industriföretag, kontor och butiker. Vi hjälper dem att flytta inom Motala och till grannorterna.",
  biz=["<b>Vi flyttar när det passar er</b> – på dagen, kvällen eller helgen, utan tillägg.",
       "<b>Kontorsmöbler, hyllor och skåp</b> monteras ned och upp.",
       "<b>Datorer, skärmar och skrivare</b> packas och märks per arbetsplats.",
       "<b>Gamla möbler</b> kan vi ta med till återvinning."],
  biz_outro="Företag får ett fast pris i en offert, eftersom RUT-avdrag bara gäller privatpersoner.",
  drop=[],
  faq=[("Vad kostar det att flytta en villa i Motala?", "En villa på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, och vi kommer med {bilar}. Om du flyttar {fri} km eller längre – till exempel till Linköping – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni företagsflytt i Motala?", "Ja, kontor, butiker och verkstäder – dag, kväll eller helg till samma pris."),
       ("Har ni flyttare i Motala?", "Ja, vi har ett eget team och en flyttbil i Motala.")]),

 "katrineholm": dict(
  m2=130,
  team=["FX Flytt har ett eget team och en egen flyttbil i Katrineholm. Vi flyttar i centrum och i Valla och på landsbygden runt omkring – Forssjö, Björkvik och Sköldinge – och vidare mot Flen och Vingåker.",
        "Runt Katrineholm bor många i villa eller på gård, där tillfart och bärsträcka påverkar hur flytten planeras. Beskriv vägen fram till huset, så kommer vi med rätt bil och rätt antal flyttare."],
  biz_h="Företagsflytt i Katrineholm",
  biz_intro="Katrineholm är en järnvägsknut med flera lager- och logistikföretag, och här finns också industri, kontor och butiker. Vi hjälper företag att flytta inom staden och till grannorterna.",
  biz=["<b>Ni väljer när</b> – dag, kväll eller helg. Priset är detsamma.",
       "<b>Vi demonterar och monterar</b> kontorsmöbler, hyllor och förvaring.",
       "<b>Datorer, skärmar och skrivare</b> packas för sig.",
       "<b>Möbler som inte ska med</b> kör vi till återvinning."],
  biz_outro="Företag har inte rätt till RUT-avdrag och får ett fast pris i en offert.",
  drop=[],
  faq=[("Vad kostar det att flytta en villa i Katrineholm?", "Ett hus på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Ligger adresserna {fri} km eller mer från varandra tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Katrineholm?", "Ja, vi flyttar kontor, butiker och lager – dag, kväll eller helg till samma pris."),
       ("Har ni egna flyttare i Katrineholm?", "Ja, vi har ett eget team och en flyttbil i Katrineholm.")]),
 # ---- Towns without an own base, served by the team in a nearby town (owner, 2026-11-26) ----
 "norrkoping": dict(
  m2=75, team_h="Vårt team för Norrköping",
  lead="Ska du flytta i Norrköping? Vårt team i Linköping hjälper dig – vi planerar flytten tillsammans med dig och ger ett tydligt pris innan vi börjar.",
  team=["I Norrköping har vi inget eget kontor, men vi har ett eget team och en egen flyttbil i Linköping, bara ett par mil bort. Det är det teamet som kommer när du flyttar i Norrköping – från ett stenhus i centrum, en lägenhet i Navestad eller Hageby eller en villa i Lindö eller Vilbergen.",
        "Du betalar samma pris som i alla våra orter. Körsträckan räknas aldrig från Linköping, bara mellan din gamla och nya adress – och korta flyttar inom staden kostar ingen körsträcka.",
        "Flyttar du mellan Norrköping och Linköping, eller vidare mot Söderköping och Finspång, planerar vi flytten så att allt får plats i rätt antal bilar."],
  biz_h="Företagsflytt i Norrköping",
  biz_intro="Norrköping är en av Sveriges viktigaste logistikstäder, med hamn, flygplats och järnväg, och här finns också kontor, handel och universitet. Vi hjälper också företag i områden som Händelö och Ingelsta.",
  biz=["<b>Ni bestämmer tiden</b> – vardag, kväll eller helg, och priset är detsamma.",
       "<b>Kontorsmöbler och hyllor</b> monteras ned på den gamla adressen och upp på den nya.",
       "<b>Datorer, skärmar och skrivare</b> packas för sig och märks per arbetsplats.",
       "<b>Gamla möbler</b> som inte ska med kör vi till återvinning."],
  biz_outro="Företag kan inte få RUT-avdrag, så ni får ett fast pris i en offert.",
  drop=["Gör ni kontorsflytt i Norrköping?"],
  faq=[("Vad kostar det att flytta i Norrköping?", "En bostad på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, och vi kommer med {bilar}. Flyttar du {fri} km eller längre – till exempel från Norrköping till Linköping – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Norrköping?", "Ja, vi flyttar kontor, butiker och lager i Norrköping – dag, kväll eller helg till samma pris."),
       ("Varifrån kommer flyttarna när jag flyttar i Norrköping?", "Från vårt team i Linköping, som har en egen flyttbil. Du betalar inte för resan dit – körsträckan räknas bara mellan dina två adresser.")]),

 "sodertalje": dict(
  m2=65, team_h="Vårt team för Södertälje",
  lead="Från höghusen i Ronna till villorna i Pershagen – vårt team i Strängnäs hjälper dig att flytta i Södertälje med tydligt pris och en fast kontaktperson.",
  team=["När du flyttar i Södertälje kommer flyttarna från vårt team i Strängnäs, som har en egen flyttbil. Teamet hjälper till i hela kommunen – från höghusen i Ronna, Hovsjö och Geneta till villorna i Pershagen och Glasberga och ute i Järna och Mölnbo.",
        "Du betalar samma pris som i alla våra orter. Körsträckan räknas inte från Strängnäs, utan bara mellan din gamla och nya adress – och korta flyttar inom staden kostar ingen körsträcka.",
        "Södertälje ligger mellan Stockholm och Mälardalen, så många flyttar går vidare mot Stockholm, Nykvarn eller Strängnäs. Berätta vart du ska, så planerar vi rätt antal bilar och flyttare."],
  biz_h="Flytt för företag och kontor i Södertälje",
  biz_intro="Södertälje är en industristad med stora arbetsgivare, och här finns också många kontor, butiker och lager. Vi hjälper också företag i områden som Moraberg och Almnäs.",
  biz=["<b>Vi flyttar när det passar er</b> – en vardag, en kväll eller en helg. Tiden påverkar inte priset.",
       "<b>Skrivbord, förvaring och mötesmöbler</b> tas isär och byggs ihop igen.",
       "<b>It-utrustning</b> – datorer, skärmar och skrivare – packas separat.",
       "<b>Möbler ni inte behöver</b> kan vi köra till återvinning."],
  biz_outro="RUT-avdrag gäller inte för företag – ni får ett fast pris i en offert.",
  drop=[],
  faq=[("Vad kostar det att flytta i Södertälje?", "En lägenhet på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, med {bilar}. Om avståndet mellan adresserna är {fri} km eller mer – till exempel mellan Södertälje och Järna – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni kontorsflytt i Södertälje?", "Ja, kontor, butiker och lager – dag, kväll eller helg, och priset är detsamma."),
       ("Varifrån kommer flyttarna när jag flyttar i Södertälje?", "Från vårt team i Strängnäs. Resan dit betalar du inte – körsträckan räknas bara mellan dina två adresser.")]),

 "nassjo": dict(
  m2=150, team_h="Vårt team för Nässjö",
  lead="Flyttar du i Nässjö eller på Höglandet? Vårt team i Jönköping hjälper dig med hela flytten – tydligt pris och personlig kontakt.",
  team=["Flyttar du i Nässjö kommer flyttarna från vårt team i Jönköping, som har en egen flyttbil och känner Höglandet väl. Vi hjälper till i Nässjö centrum och Runneryd och ute i Forserum, Anneberg, Malmbäck och Bodafors. Bor du på landet utanför tätorten, beskriv gärna vägen fram till huset och var bilen kan stå.",
        "Du betalar samma pris som i alla våra orter. Körsträckan räknas aldrig från Jönköping, bara mellan din gamla och nya adress – flyttar du inom Nässjö kostar den oftast ingenting.",
        "Nässjö är en gammal järnvägsknut, och många flyttar hit eller härifrån för jobbet – till Jönköping, Eksjö eller Tranås. Säg vilket datum du behöver vara klar, så planerar vi efter det."],
  biz_h="Företagsflytt i Nässjö",
  biz_intro="Nässjö är ett logistiknav med en stor kombiterminal, och här finns också industri, kontor och butiker. Vi hjälper också företag i industriområdena Södergården och Norrboda.",
  biz=["<b>Ni väljer dag och tid</b> – även kväll och helg, till samma pris.",
       "<b>Kontorsmöbler, hyllor och arkiv</b> demonteras och monteras på den nya adressen.",
       "<b>Datorer, skärmar och skrivare</b> packas och märks.",
       "<b>Det som inte ska med</b> kör vi till återvinning."],
  biz_outro="Företag får ett fast pris i en offert eftersom RUT-avdrag bara gäller privatpersoner.",
  drop=[],
  faq=[("Vad kostar det att flytta en villa i Nässjö?", "En villa på {m2} m² kostar {pris} till fast pris efter RUT-avdrag, och vi kommer med {bilar}. Flyttar du {fri} km eller längre – till exempel till Jönköping – tillkommer {kmpris} kr per km och flyttbil."),
       ("Gör ni företagsflytt i Nässjö?", "Ja, vi flyttar kontor, butiker och lager i Nässjö – dag, kväll eller helg, till samma pris."),
       ("Varifrån kommer flyttarna när jag flyttar i Nässjö?", "Från vårt team i Jönköping. Resan dit betalar du inte – körsträckan räknas bara mellan dina två adresser.")]),
}

def apply(cities):
    """Adds the team and company sections and the FAQ to the towns in TEAM."""
    for c in cities:
        t = TEAM.get(c["slug"])
        if not t:
            continue
        n, m2 = c["name"], t["m2"]
        if "desc" in t: c["desc"] = t["desc"]
        if "lead" in t: c["lead"] = t["lead"]
        new_q = {q for q, _ in t["faq"]}
        c["faq"] = [f for f in c["faq"] if f[0] not in t["drop"] and f[0] not in new_q] + \
                   [(q, _fill(a, m2)) for q, a in t["faq"]]
        c["extra_html"] = (
            f'<h3 style="color:var(--navy);margin-top:28px">{t.get("team_h", "Vårt team i " + n)}</h3>'
            + "".join(f"<p>{p}</p>" for p in t["team"])
            + f'<h3 style="color:var(--navy);margin-top:28px">{t["biz_h"]}</h3>'
            + f'<p>{t["biz_intro"]}</p>'
            + '<ul class="ticks" style="display:grid;gap:10px">' + "".join(f"<li>{x}</li>" for x in t["biz"]) + "</ul>"
            + f'<p>{t["biz_outro"]} <a href="kontorsflytt.html">Läs mer om kontorsflytt</a>.</p>')
