# "Bra att veta" – one short text per city, written for that city only (shown on its landing page).
# Only general, well-known facts about each place, turned into practical advice for the move.
# Keep claims about FX Flytt itself out of here – those live in the city data in build_cities.py / extra_cities.py.

LOCAL = {
 "kungsor": [
  "Kungsör är en liten ort vid Mälaren, och många flyttar här är korta – inom tätorten, ut till Valskog eller till grannorterna Arboga, Köping och Eskilstuna. Korta flyttar under 15 km har ingen körsträcka i priset.",
  "Flyttar du från ett äldre hus i centrum, eller från en gård på landsbygden, är bärsträckan ofta det som avgör hur lång flyttdagen blir. Berätta hur nära dörren lastbilen kan stå, så skickar vi rätt antal personer. Eftersom vårt kontor ligger här kan du också komma förbi och gå igenom flytten med oss innan du bokar."],
 "orebro": [
  "Örebro är en universitetsstad, och det märks på flyttarna: i augusti och januari flyttar många studenter samtidigt, och i slutet av varje månad är trycket högt i hela staden. Vill du ha en viss dag – boka i god tid eller välj en dag mitt i månaden.",
  "I centrum och på Väster finns många äldre flerfamiljshus där hissen är liten eller saknas helt, medan Adolfsberg, Rynninge och Mosås mest har villor och radhus med förråd och garage. Skriv vilken typ av bostad du flyttar från och till, så räknar vi med rätt tid och rätt bil."],
 "eskilstuna": [
  "Eskilstuna har en stor variation i boende: höghus i Fröslunda, Skiftinge och Lagersberg, villakvarter i utkanterna och äldre trähus i Torshälla. Höghusen har oftast hiss, men den är inte alltid stor nog för soffor och garderober – då bär vi i trappan, och det planerar vi in från början.",
  "Mälardalens universitet har campus i Eskilstuna, så kring terminsstart är det många som flyttar samtidigt. Flyttar du mellan Eskilstuna och Västerås, Strängnäs eller Kungsör är det korta sträckor där priset bara påverkas lite av avståndet."],
 "vasteras": [
  "Västerås är en av Mellansveriges största städer, med Mälardalens universitet, många stora arbetsgivare och nya bostadsområden som växer fram. Det betyder många flyttar året runt – särskilt i augusti, i slutet av månaderna och på helger.",
  "I centrum och närmaste stadsdelarna bor de flesta i lägenhet, ofta med smal trappa eller liten hiss, medan Skultuna, Dingtuna och Irsta har mer villor och gårdar. Ska du flytta mellan Västerås och Kungsör, Köping eller Eskilstuna är det några mil, och körsträckan räknas bara på avståndet mellan dina två adresser."],
 "katrineholm": [
  "Katrineholm är en järnvägsknut mitt i Södermanland, och många som flyttar hit pendlar vidare – till Stockholm, Norrköping eller Eskilstuna. Flyttar du för ett nytt jobb, berätta vilket datum du måste vara på plats, så planerar vi flyttdagen efter det.",
  "Runt staden ligger mindre orter och landsbygd som Forssjö, Björkvik och Sköldinge. Där är det ofta villor eller gårdar med uthus, och vägen fram kan vara smal eller grusad. Ju mer vi vet om tillfarten i förväg, desto smidigare går lastningen."],
 "karlstad": [
  "Karlstad är Värmlands residensstad och universitetsstad, vid Klarälvens utlopp i Vänern. Kring terminsstart i augusti och januari flyttar många studenter, framför allt i Kronoparken och runt universitetet – då är det klokt att boka tidigt.",
  "Flyttar du mellan Karlstad och Mälardalen eller Örebro handlar det om många mil, så packningen behöver vara stabil för en längre transport. Vi lastar så att inget glider under resan och kör hela vägen med samma team, så att samma personer lastar ur som lastade."],
 "sodertalje": [
  "Södertälje är en industristad med stora arbetsgivare och pendeltåg till Stockholm, och många flyttar hit för jobbet – berätta vilket datum du måste vara på plats, så planerar vi flyttdagen efter det.",
  "I höghusen är hissen ofta det som styr flyttdagen – kolla med hyresvärden om den behöver bokas och hur stor den är. På villagator kan parkeringen vara smal; berätta om det, så kan lastbilen stå så nära som möjligt utan att blockera grannarna."],
 "akersberga": [
  "Åkersberga är centralort i Österåkers kommun, med Roslagsbanan in till Stockholm. Båtprylar, trädgårdsmöbler och det som står i sjöboden eller på vinden är lätt att glömma när man räknar volymen – gå igenom alla utrymmen innan du begär offert.",
  "Flyttar du till eller från ett fritidshus nära vattnet, kolla om lastbilen kan köra ända fram eller om vi behöver bära en bit. På sommaren är det fler som flyttar till och från sina sommarhus, så boka gärna i god tid."],
 "norrtalje": [
  "Norrtälje är Roslagens största ort, och avstånden inom kommunen kan vara långa. Skriv båda adresserna så exakt som möjligt i förfrågan, så att körsträckan och tiden blir rätt från början.",
  "På sommaren ökar trafiken och antalet flyttar till och från sommarhus. Bor du på landet, berätta om vägen fram – grusväg, smal infart eller vinterväg påverkar vilken bil vi skickar."],
 "nykoping": [
  "Nyköping är residensstad i Södermanland, vid kusten och med Skavsta flygplats strax utanför. I villaområden som Arnö, Harg och Stigtomta finns ofta förråd, garage och trädgård som också ska med – räkna med dem när du uppskattar volymen.",
  "Flyttar du mellan Nyköping och Katrineholm, Eskilstuna eller Norrköping är det några mil – körsträckan räknas bara på avståndet mellan dina två adresser. Kustnära hus kan ha smala vägar fram; berätta om det i förfrågan."],
 "norrkoping": [
  "Norrköping är en gammal industristad, och i centrum finns många äldre stenhus där hiss saknas eller är mycket liten. Flyttar du från fjärde våningen utan hiss tar det längre tid – därför frågar vi alltid om våning och hiss innan vi ger ett pris.",
  "Linköpings universitet har campus mitt i Norrköping, så studentflyttarna är många kring terminsstart. Lindö, Vilbergen och Åby har mer villor och radhus, ofta med förråd och garage som också ska med."],
 "linkoping": [
  "Med många studenter i Ryd, Lambohov och runt Campus Valla är augusti och januari extra intensiva flyttmånader – vill du ha en viss dag, boka tidigt.",
  "I nya områden som Vallastaden har husen hiss, men det kan vara svårt att parkera nära porten. Villaområden som Hjulsbro och Malmslätt har mer saker i förråd och garage. Berätta om parkeringen, så planerar vi rätt."],
 "motala": [
  "Göta kanal går genom Motala, och här finns allt från lägenheter i centrum till villor vid vattnet och gårdar mot Borensberg och Fornåsa.",
  "Hus nära sjön och kanalen har ibland smala vägar och begränsad parkering, och på sommaren är det mer trafik i centrum. Berätta hur nära lastbilen kan stå. Flyttar du mellan Motala och Linköping, Mjölby eller Örebro räknas körsträckan bara på avståndet mellan dina två adresser."],
 "mjolby": [
  "Mjölby ligger vid E4:an mellan Linköping och Tranås, och många pendlar härifrån – flyttar du för ett nytt jobb, berätta vilket datum du måste vara på plats.",
  "Villaflytt betyder ofta mer än det man först tänker på: förrådet, garaget, trädgårdsmöblerna och kanske en frys i källaren. Gå igenom alla utrymmen innan du begär offert – eller använd kubikräknaren, så blir priset rätt från början."],
 "jonkoping": [
  "Jönköping ligger vid Vätterns södra spets, och staden är känd för sina backar. Branta gator och långa trappor upp till husen gör bärsträckan viktig – berätta om den, så skickar vi rätt antal personer.",
  "Jönköping University gör att många studenter flyttar kring terminsstart, och i centrum och på Öster finns många äldre hus utan hiss. Runt staden ligger Huskvarna, Bankeryd och Gränna med mer villor och gårdar. Längre flyttar mot Mellansverige planerar vi så att samma team kör hela vägen."],
 "nassjo": [
  "I villor och radhus finns ofta förråd, garage och vind som också ska tömmas. Gå igenom alla utrymmen innan du begär offert, så räknar vi med rätt bil från början.",
  "På Höglandet kan vintrarna vara snörika, och då är det bra att tänka på tillfarten: är uppfarten plogad och går det att vända med lastbil? Flyttar du mellan Nässjö och Jönköping eller Tranås är det korta sträckor – och längre flyttar planerar vi så att allt följer med på samma bil."],
 "tranas": [
  "Hus vid sjön och på landet har ofta uthus, båtprylar och trädgårdsmöbler som också ska med. Räkna med dem när du uppskattar volymen – kubikräknaren hjälper dig.",
  "Sådana hus har ofta längre bärsträcka och ibland grusväg fram, och det påverkar hur lång tid flytten tar. Berätta om tillfarten. Flyttar du mellan Tranås och Mjölby, Nässjö eller Linköping räknas körsträckan bara på avståndet mellan dina adresser."],
 "vastervik": [
  "På sommaren fylls Västervik av besökare. Det betyder mer trafik och svårare parkering i centrum under juli – flyttar du då, boka i god tid och berätta hur nära porten lastbilen kan stå.",
  "Flyttar du hit från Mälardalen eller Stockholmsområdet är packningen extra viktig: kartonger som tål staplingen och möbler som skyddas för en längre resa. Med Deluxe packar vi åt dig."],
 "vimmerby": [
  "Vimmerby är känt för Astrid Lindgrens Värld, och under sommaren är det mycket trafik i och runt staden – flyttar du i juli lönar det sig att välja en vardag och boka tidigt.",
  "På gårdarna runt staden kan uthus, verkstäder och lador innehålla mer än man tror. Gå igenom allt innan du begär offert, så att vi skickar en bil som räcker."],
 "ludvika": [
  "Stora industriarbetsgivare gör att många flyttar till Ludvika för jobbet – berätta vilket datum du måste vara på plats, så planerar vi flyttdagen efter det.",
  "Vintrarna i Dalarna kan vara kalla och snörika. Flyttar du under vintern, se till att uppfarten är skottad och sandad, och packa sådant som inte tål kyla – växter, elektronik och flaskor – så att det kan stå varmt. Längre flyttar planerar vi så att samma team kör hela vägen."],

 # ---- Added 2026-11-16
 "arboga": [
  "Arboga är grannort till Kungsör, där vårt kontor ligger – du har alltså nära till oss, och många flyttar här är korta. Flyttar du mellan Arboga och Kungsör, Köping eller Götlunda är avståndet ofta så kort att det knappt märks i priset.",
  "Den gamla stadskärnan har trähus, smala gator och trappor där stora möbler får bäras försiktigt. Berätta om hissen saknas och hur nära porten lastbilen kan stå, så skickar vi rätt antal personer och planerar tiden därefter."],
 "koping": [
  "Många flyttar i Köping är korta – inom staden eller till Kungsör, Arboga och Kolsva – och då ingår körsträckan när avståndet mellan adresserna är under 15 km.",
  "Har du villa eller gård, gå igenom uthus, förråd och garage innan du begär offert, så räknar vi med rätt bil från början."],
 "kumla": [
  "Flyttar du mellan Kumla och Örebro är det en kort sträcka, och priset påverkas bara lite av avståndet – det mesta handlar om boytan och vad som ska med.",
  "Kumla har mycket villor och radhus, ofta med förråd, garage och trädgård. Det är lätt att glömma utemöbler, verktyg och sådant som står i förrådet när man räknar volymen – använd gärna kubikräknaren innan du begär offert."],
 "karlskoga": [
  "Många flyttar till Karlskoga för jobbet, och då är datumet ofta det viktigaste – berätta när du måste vara på plats, så planerar vi flyttdagen efter det.",
  "Runt staden finns landsbygd och sjönära boende, där vägen fram kan vara smal eller grusad. Flyttar du mellan Karlskoga och Örebro eller Mälardalen räknas körsträckan bara på avståndet mellan dina två adresser."],
 "strangnas": [
  "Flyttar du hit från Stockholmsområdet är det ofta en längre flytt, och då lönar det sig att packa ordentligt och märka kartongerna rum för rum – så går både lastning och uppackning snabbare.",
  "I Mariefred finns många äldre hus med branta trappor, medan Strängnäs och Åkers styckebruk har både lägenheter och nya villaområden. Berätta om trappor, hiss och parkering, så planerar vi rätt."],
 "enkoping": [
  "Flyttar du till Enköping för jobbet eller för att få mer plats, berätta vilket datum som passar – helger och slutet av månaden är populärast, så boka i god tid.",
  "På landsbygden runt staden kan tillfarten till villor och gårdar vara smal eller grusad, så berätta hur nära huset lastbilen kan köra."],
 "uppsala": [
  "Uppsala är en av Sveriges största studentstäder, med Uppsala universitet och SLU. Kring terminsstart i augusti och januari flyttar tusentals studenter samtidigt, särskilt i Flogsta, Rackarberget och Kåbo – vill du ha en viss dag, boka i god tid.",
  "I centrum och Luthagen finns många äldre hus med liten eller ingen hiss, medan Rosendal och andra nya områden har hiss men ofta trångt att parkera. Berätta om både hiss och parkering, så kommer rätt team med rätt bil."],
 "stockholm": [
  "I Stockholms innerstad – Södermalm, Kungsholmen, Vasastan och Östermalm – bor de flesta i flerfamiljshus, ofta sekelskifteshus med liten hiss eller bara trappor. Det är också svårt att parkera nära porten, så berätta hur gatan ser ut och om det finns lastzon.",
  "Kranskommunerna som Huddinge, Botkyrka, Haninge, Järfälla, Sollentuna, Täby och Nacka har mer höghus, radhus och villor, ofta med förråd och garage. Flyttar du från Stockholm till Mälardalen eller tvärtom är det en längre flytt – då planerar vi lastningen så att allt följer med på samma bil."],
}
