# Változásnapló

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
