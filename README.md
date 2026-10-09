**KAÜ (Ügyfélkapu+) kétfaktoros automata beléptető – Tampermonkey userscript**

**Ha nem tudod mit az a TOTP akkor itt hagyd abba az olvasást :)**

Ez a Tampermonkey userscript többprofilos, félautomata–automata belépést valósít meg a magyar kormányzati bejelentkezési folyamaton, amikor a szolgáltatás a **kau.gov.hu** központi azonosítót, majd az **idp.gov.hu** oldalt használja a kétfaktoros beléptetésre. A script kezelőfelületet ad a belépési profilokhoz (felhasználónév, jelszó, TOTP), választható profillal indítja a belépést, igény szerint automatikus időzített belépést végez, és kitölti az IDP jelszó és TOTP űrlapjait.

**Támogatott domainek**

-   Szolgáltatói oldalak (pl. \*.oeny.hu)
-   Központi azonosító: kau.gov.hu
-   Identity Provider: idp.gov.hu

A script a domainek közötti átirányítás során kezeli a belépési folyamat állapotát.

**Fő funkciók**

-   **Profilkezelő felület (Shadow DOM):** több profil mentése, törlése, alapértelmezett profil kijelölése.
-   **Választóablak a KAÜ oldalon:** profilválasztás, opcionális 10 mp-es autologin visszaszámlálással.
-   **Autologin kapcsoló:** globálisan ki- és bekapcsolható.
-   **Export/Import (JSON):** profilok exportja fájlba, importálása fájlból
-   **Google szinkron:** a profilok titkosítva szinkronizálódnak a saját Google-fiókodon keresztül több gép között (opcionális, lásd lent).
-   **Beépített TOTP:** WebCrypto alapú HMAC-SHA1 TOTP generálás.

**Telepítés**

1.  Telepítsd a **[Tampermonkey](https://www.tampermonkey.net/)** bővítményt a böngésződbe.
2.  [Kattints ide a telepítéshez](https://github.com/danzig666/kau_belepteto/raw/refs/heads/main/kau_login.user.js)
4.  Ha az előző megoldás nem működik, hozz létre új userscriptet és illeszd be a forráskódot és engedélyezd a scriptet.
5.  **Ha korábban a v2.6.5 vagy régebbi verziót használtad:** azokban a `@name` tartalmazta a verziószámot, ezért a Tampermonkey minden kiadást külön scriptként telepített, külön adattárral. Előbb exportáld a profiljaidat, majd az irányítópulton töröld az összes régi példányt, telepítsd a v2.6.6-ot, és importáld vissza az adatokat. Ettől a verziótól a frissítés helyben történik.
5.  Látogasd meg a támogatott oldalakat (pl. oeny.hu), majd indítsd a bejelentkezést.

**Használat**

**Profilkezelő megnyitása**

-   A lap jobb felső sarkában megjelenik a **KAÜ Kezelő** gomb. Erre kattintva nyílik meg a profilkezelő.

**Új profil hozzáadása**

-   Add meg az **Alias**, **Felhasználónév**, **Jelszó**, **TOTP kód** vagy **otpauth://** URI értékeket.
-   Kattints az **Új entése** gombra.
-   Igény szerint jelöld ki **Automatikus belépés** profilnak.

**Azonnali belépés**

-   A profilkezelőben minden profilnál található **Belépés most** gomb. Erre kattintva a script azonnal elindítja a teljes belépési folyamatot a kiválasztott profillal.

**Autologin ki/be kapcsolása**

-   A profilkezelő tetején található **Autologin: BE/KI** státusz és egy kapcsoló. Kikapcsolva a KAÜ választó modál nem indít visszaszámlálást.

**Exportálás / Importálás**

-   **Exportálás fájlba:** a jelenlegi profilok és beállítások JSON fájlba mentése.
-   **Importálás fájlból:** egy korábban exportált JSON betöltése és összeolvasztása a meglévő profilokkal (azonos alias felülír).
-   Biztonsági megjegyzés: az exportált fájl érzékeny adatokat tartalmaz.

**Google szinkron (opcionális)**

Ha több gépen (vagy több böngészőben) használod a scriptet, a profilokat a saját Google-fiókodon keresztül szinkronizálhatod. A működés röviden:

-   A script egy kis, **saját Google Apps Script** webalkalmazáson keresztül szinkronizál, amit egyszer kell létrehoznod a saját Google-fiókodban. Nem kell hozzá Google Cloud projekt vagy OAuth beállítás, és a kód teljes egészében a tiéd.
-   Az adat ennek az Apps Script projektnek a saját tárában (*Script Properties*) van. Az Apps Script **semmilyen Google-jogosultságot nem kér** (Drive-ot, Gmailt stb. sem), ezért nem kell semmit engedélyezni, és a Google sem tiltja le.
-   A tárba csak **titkosított** adat kerül: a script a böngészőben, feltöltés előtt titkosít (AES-256-GCM, a kulcs a titkosítási jelszavadból készül PBKDF2-vel). A titkosítási jelszó nélkül sem a Google, sem más nem tudja elolvasni.

Amit szinkronizál: a profilokat (alias, felhasználónév, jelszó, TOTP), a törléseket és az alapértelmezett profilt. Az **Autologin BE/KI** kapcsoló gépenként külön marad.

*1. lépés – Az Apps Script projekt létrehozása*

1.  Nyisd meg a [script.google.com](https://script.google.com/) oldalt a Google-fiókoddal.
2.  Kattints az **Új projekt** (New project) gombra.
3.  Bal fent kattints a **Névtelen projekt** (Untitled project) feliratra, és nevezd el, pl. `KAU szinkron`.
4.  A szerkesztőben megnyílik a `Code.gs` (magyar felületen `Kód.gs`) fájl egy üres `myFunction` függvénnyel. **Töröld ki a teljes tartalmát.**
5.  Nyisd meg ebben a repóban az [`apps_script/Code.gs`](apps_script/Code.gs) fájlt, másold ki a teljes tartalmát (GitHubon a fájl nézetben a *Copy raw file* ikonnal), és illeszd be a szerkesztőbe.
6.  Mentsd el: **Ctrl+S** vagy a floppy ikon.

*2. lépés – A `setup` futtatása és a hozzáférési kulcs kimásolása*

1.  A szerkesztő felső eszköztárán a **Futtatás** (Run) gomb mellett van egy legördülő lista a függvények nevével. Válaszd ki a **`setup`** függvényt.
2.  Kattints a **Futtatás** (Run) gombra. Engedélyt nem kér, pár másodperc alatt lefut.
3.  Alul megnyílik a **Végrehajtási napló** (Execution log), benne egy ilyen sorral: `Hozzáférési kulcs: 3f9a...`. Ez egy 64 karakteres kulcs. **Másold ki** (csak a kulcsot, a `Hozzáférési kulcs: ` előtag nélkül), erre a 4. lépésben lesz szükség.

A kulcs a projektben marad, a `setup` újrafuttatása ugyanazt írja ki. Ha később elfelejted, futtasd újra a `setup`-ot, és nézd meg a naplót.

> Ha a futtatáskor mégis engedélyt kér, vagy azt írja, hogy *„Az alkalmazás le van tiltva”*, akkor a projektben még a `Code.gs` korábbi változata van (amelyik a Drive-hoz kért hozzáférést). Cseréld le a mostanira (1. lépés, 4–6. pont).

*3. lépés – Telepítés webalkalmazásként*

1.  Jobb fent kattints a **Telepítés** (Deploy) gombra, majd válaszd az **Új telepítés** (New deployment) menüpontot.
2.  A *Típus kiválasztása* (Select type) mellett kattints a fogaskerék ikonra, és válaszd a **Webalkalmazás** (Web app) típust.
3.  Állítsd be:
    -   **Leírás** (Description): bármi, pl. `KAU szinkron`.
    -   **Végrehajtás mint** (Execute as): **Én** (Me, a saját e-mail-címed). Így a webalkalmazás a te projektedben tárolt adathoz fér hozzá.
    -   **Hozzáférés** (Who has access): **Bárki** (Anyone). *Nem* a „Bárki, akinek Google-fiókja van” opció! A Tampermonkey script bejelentkezés nélkül hívja a webalkalmazást, a védelmet a hozzáférési kulcs és a titkosítás adja.
4.  Kattints a **Telepítés** (Deploy) gombra.
5.  Megjelenik a **Webalkalmazás URL-je** (Web app URL), ami így néz ki: `https://script.google.com/macros/s/AKfycb.../exec`. **Másold ki** a **Másolás** (Copy) gombbal.
6.  Ellenőrzés (nem kötelező): nyisd meg az URL-t egy új böngészőlapon. Ha minden rendben van, ezt a szöveget látod: *„A KAÜ szinkron szolgáltatás működik.”*

> Céges / iskolai (Google Workspace) fiókban a rendszergazda letilthatja a „Bárki” hozzáférést. Ilyenkor használj magán Gmail-fiókot.

*4. lépés – A szinkron bekapcsolása a Tampermonkey scriptben*

1.  Nyisd meg a **KAÜ Kezelő**t (a kau.gov.hu oldalon jobb felül).
2.  A **Google szinkron** résznél kattints a **Szinkron beállítások** gombra.
3.  Töltsd ki:
    -   **Apps Script webalkalmazás URL**: a 3. lépésben kimásolt, `/exec` végű URL.
    -   **Hozzáférési kulcs**: a 2. lépésben kimásolt kulcs.
    -   **Titkosítási jelszó**: tetszőleges, **legalább 6 karakter** hosszú jelszó. Ezzel titkosítja a script az adatokat. **Minden gépen ugyanazt kell megadni.** Ha elfelejted, a tárolt adat nem állítható vissza (a gépeken helyben tárolt profilok megmaradnak, és új jelszóval újra fel lehet tölteni őket, lásd lent).
    -   **Automatikus szinkron**: bekapcsolva a script magától szinkronizál a kezelő megnyitásakor, minden módosítás (új profil, törlés, alapértelmezett profil, import) után, valamint a KAÜ oldal betöltésekor (legfeljebb percenként egyszer). Kikapcsolva csak a **Szinkron most** gombra szinkronizál.
4.  Kattints a **Mentés és szinkron** gombra. Az állapotjelzőn megjelenik: *Utolsó szinkron: ...*

*5. lépés – További gépek*

Minden további gépen telepítsd a scriptet, és végezd el a 4. lépést **ugyanazzal** az URL-lel, kulccsal és titkosítási jelszóval. Az Apps Script projektet nem kell újra létrehozni. Az első szinkronkor a gépen már meglévő profilok összefésülődnek a tárolt profilokkal, semmi nem vész el.

*Hogyan fésüli össze a változásokat?*

-   Profilonként (alias szerint) a **későbbi** módosítás nyer, legyen az mentés vagy törlés. Ha az egyik gépen törölsz egy profilt, a többin is törlődik, nem jön vissza.
-   Ha két gép egyszerre ír, a script ezt észleli, újra letölti az adatokat, összefésüli, és csak utána ír.
-   A gépek óráján múlik, melyik módosítás számít későbbinek, ezért legyen pontos a rendszeridő (Windowson ez alapértelmezetten automatikus).

*Hibaelhárítás*

| Hibaüzenet | Teendő |
| --- | --- |
| *Hibás hozzáférési kulcs.* | Rosszul másoltad a kulcsot. Futtasd újra a `setup`-ot, és másold ki újra (előtag és szóköz nélkül). |
| *A szerver nem a várt választ adta...* | Rossz az URL (a `/exec` végűt kell használni, nem a `/dev` végűt), vagy a telepítésnél a hozzáférés nem **Bárki** (Anyone). Javítsd: **Telepítés → Telepítések kezelése** (Manage deployments), ceruza ikon, majd a beállítás módosítása. |
| *Nem sikerült visszafejteni a tárolt adatokat...* | Ezen a gépen más a titkosítási jelszó, mint amivel a tárolt adat készült. Add meg a helyeset. A script ilyenkor **nem írja felül** a tárolt adatot. |
| *Nem érhető el a szerver...* | Hálózati hiba. Ellenőrizd az internetkapcsolatot, és próbáld újra. |
| *Szerverhiba: A setup függvény még nem futott le.* | Futtasd a `setup` függvényt az Apps Script szerkesztőben (2. lépés). |
| *Az alkalmazás le van tiltva* (a `setup` futtatásakor) | A projektben a `Code.gs` régi változata van. Cseréld le a mostanira, ez nem kér jogosultságot. |

*Karbantartás*

-   **Kulcscsere** (ha a kulcs illetéktelen kézbe került): az Apps Script szerkesztőben futtasd a `resetToken` függvényt, a naplóból másold ki az új kulcsot, és írd át minden gépen.
-   **Titkosítási jelszó cseréje:** a tárolt adat még a régi jelszóval van titkosítva, ezért azt előbb törölni kell. Az Apps Script szerkesztőben futtasd a `resetData` függvényt. Utána az egyik gépen írd át a jelszót, és nyomd meg a **Szinkron most** gombot: a script az új jelszóval feltölti a profilokat. Ezután a többi gépen is add meg az új jelszót.
-   **Az Apps Script kód frissítése:** illeszd be az új kódot, ments, majd **Telepítés → Telepítések kezelése** (Manage deployments), ceruza ikon, **Verzió: Új verzió** (Version: New version), **Telepítés** (Deploy). Így az URL nem változik. Az *Új telepítés* új URL-t adna.
-   **Kikapcsolás:** a kezelőben a **Szinkron kikapcsolása ezen a gépen** gomb csak az adott gép beállításait törli. A profilok és a tárolt adat megmaradnak. Teljes megszüntetéshez töröld az Apps Script projektet (script.google.com, a projekt melletti ⋮ menü, **Eltávolítás** / Remove). Ezzel a tárolt adat is törlődik.

**Belépési folyamat**

1.  Szolgáltatói oldalon indítod a bejelentkezést.
2.  **kau.gov.hu**: itt jelenik meg a profilválasztó ablak. Itt választhatsz profilt, megnyithatod a kezelőt, vagy megszakíthatod.
3.  **idp.gov.hu – jelszó:** a script kitölti a felhasználónevet és a jelszót, majd elküldi az űrlapot.
4.  **idp.gov.hu – TOTP:** a script legenerálja és beírja a TOTP kódot, majd elküldi az űrlapot.
5.  Visszairányítás a szolgáltatói oldalra, immár bejelentkezve.

**Műszaki áttekintés**

-   **Állapotkezelés:** a script a Tampermonkey tárát használja. A flow időbélyeggel és lépésjelölővel (start/password/totp/done) követett, lejárati idővel.
-   **Választó ablak:** csak a **kau.gov.hu** választóoldalán jelenik meg. Shadow DOM-ot használ, így nem ütközik az oldal saját stílusaival és eseménykezelőivel.
-   **Autologin generációs védelem:** egy globális számláló érvényteleníti a futó visszaszámlálásokat, ha megnyitod a kezelőt vagy megszakítod a folyamatot.
-   **TOTP:** WebCrypto API segítségével HMAC-SHA1 alapú TOTP (RFC 6238), külső függőség nélkül.
-   **Szinkron:** a profilok `updatedAt` időbélyeget kapnak, a törlésekről időbélyeges jelölő (`deleted`) marad meg, így a script profilonként össze tudja fésülni a gépek állapotát. A titkosítás AES-256-GCM, a kulcs PBKDF2-SHA256-tal (600 000 iteráció, véletlen só) készül a titkosítási jelszóból. Az Apps Script a titkosított adatot a projekt Script Properties tárában tartja (8000 karakteres darabokban, az értékenkénti 9 KB-os korlát miatt), és verziószámmal (optimista zárolással) véd az egyidejű írások ellen. A kérések `GM_xmlhttpRequest`-tel, sütik nélkül mennek a `script.google.com` címre.

**Biztonság**

-   A hitelesítési adatok a böngészőben, a Tampermonkey tárában tárolódnak.
-   Az **exportált JSON** jelszavakat és TOTP titkokat tartalmaz, kezeld bizalmasan, és csak biztonságos helyen tárold.
-   Nyilvános repóba ne tölts fel valódi adatokat tartalmazó exportot.
-   **Google szinkron:** a Google-fiókodba csak titkosított adat kerül. A titkosítási jelszót a script a többi adattal együtt a Tampermonkey tárában tárolja az adott gépen. A Google-hoz nem kerül fel. A webalkalmazás URL-jét és a hozzáférési kulcsot is kezeld bizalmasan: a kulccsal a titkosított adat letölthető és felülírható (olvasni a titkosítási jelszó nélkül nem lehet).

**Licenc**

MIT License.
