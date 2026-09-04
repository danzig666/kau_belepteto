# Változásnapló

## v2.6.6

**Javítva: több példány futott egyszerre, ezért a régi jelszóval próbált belépni.**

- A `@name` mező eddig tartalmazta a verziószámot (`... (v2.6.4)`, `... (v2.6.5)`).
  A Tampermonkey a `@name` + `@namespace` páros alapján azonosítja a scriptet, így
  minden kiadás **külön scriptként települt, külön GM adattárral**. Több példány
  futott egyszerre ugyanazon az oldalon: az egyik kezelőjében töröltél és
  importáltál, de a másik példány a saját, elavult adataiból töltötte ki az
  űrlapot. A `@name` mostantól verziószám nélküli és állandó.
- Új `@downloadURL` és `@updateURL`, így a Tampermonkey ezentúl valóban
  **frissíti** a scriptet új telepítés helyett.
- `@noframes`: a script nem indul el iframe-ekben.
- Beépített védelem duplikált példány ellen: ha egy másik példány már fut az
  oldalon, a script leáll, és a konzolra figyelmeztetést ír.

**Egyéb**

- A script már nem választ magától alapértelmezett profilt, ha egynél több van.
  A v2.6.5-ben törlés/import után az elsőre esett vissza, így a visszaszámláló
  csendben egy **másik fiókkal** léphetett be.
- A visszaszámláló szövege megnevezi, melyik profillal fog belépni.
- Konzol diagnosztika: melyik verzió indult, hány profil van az adattárában,
  melyik profillal és milyen hosszú jelszóval tölti ki az űrlapot.

### Frissítés v2.6.6-ra

1. Exportáld a profiljaidat a jelenleg **működő** példányból.
2. A Tampermonkey irányítópulton **töröld az összes régi példányt**
   (`... (v2.6.3)`, `... (v2.6.4)`, `... (v2.6.5)`).
3. Telepítsd a v2.6.6-ot, majd importáld vissza az exportált fájlt.

Innentől a frissítések helyben történnek, az adattár megmarad.

## v2.6.5

**Javítva: törlés + import után nem működött a belépés.**

- A belépési folyamat (flow) eddig a profil teljes másolatát mentette a tárba, és
  végig abból dolgozott. Egy törlés + import után is a 3 percig élő, **régi**
  jelszóval és TOTP titokkal próbált belépni. Mostantól a flow csak az aliast
  tárolja, a profilt minden lépésnél frissen olvassa ki.
- Profil törlése, importálás, új profil mentése és az alapértelmezett profil
  átállítása mostantól eldobja a futó flow-t. Eddig a bennragadt flow a
  profilválasztó ablak megjelenését is elnyomta, így úgy tűnt, semmi nem történik.
- Ha a folyamathoz tartozó profil időközben eltűnt, a belépés leáll a fantom
  adatok használata helyett.
- Törlés és import után az alapértelmezett profil visszaáll az első meglévőre
  `null` helyett, így az autologin visszaszámláló újra elindul.

**Import**

- Jelenti, hány profil került be, és mi maradt ki. Eddig a hiányos bejegyzéseket
  csendben eldobta, de „Importálás kész” üzenetet írt ki.
- A `totp_uri` mellett elfogadja a `totp`, `secret` és `otpauth` mezőneveket is.
- Import után a teljes kezelő felület frissül (autologin állapot és kapcsoló),
  nem csak a profillista.

**TOTP**

- A Base32 titok tűri a `=` paddinget, a szóközöket és a kisbetűket. Eddig a `=`
  karakter kivételt dobott, és a belépés hibaüzenettel állt le.
- Az „Új mentése” gomb már a mentéskor visszajelez érvénytelen TOTP titok esetén,
  nem csak a belépésnél derül ki.
- Az első mentett profil automatikusan alapértelmezetté válik.

**Egyéb**

- Megszűnt a lezáratlanul futó visszaszámláló időzítő a profilválasztó ablakban.
