**KAÜ (Ügyfélkapu+) kétfaktoros automata beléptető – Tampermonkey userscript**

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
-   **Beépített TOTP:** WebCrypto alapú HMAC-SHA1 TOTP generálás.

**Telepítés**

1.  Telepítsd a **Tampermonkey** bővítményt a böngésződbe.
2.  Hozz létre új userscriptet, és illeszd be a forráskódot.
3.  Engedélyezd a scriptet.
4.  Látogasd meg a támogatott oldalakat (pl. oeny.hu), majd indítsd a bejelentkezést.

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

**Biztonság**

-   A hitelesítési adatok a böngészőben, a Tampermonkey tárában tárolódnak.
-   Az **exportált JSON** jelszavakat és TOTP titkokat tartalmaz, kezeld bizalmasan, és csak biztonságos helyen tárold.
-   Nyilvános repóba ne tölts fel valódi adatokat tartalmazó exportot.

**Licenc**

MIT License.
