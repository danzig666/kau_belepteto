/**
 * KAÜ beléptető – Google Drive szinkron szolgáltatás (Google Apps Script)
 *
 * A Tampermonkey script ezen a webalkalmazáson keresztül olvassa és írja a
 * Google Drive-odon lévő szinkronfájlt. A fájlba csak a böngészőben már
 * titkosított adat kerül; ez a script nem ismeri a titkosítási jelszót.
 *
 * Beállítás: lásd a README "Google Drive szinkron" fejezetét.
 *   1. Futtasd egyszer a `setup` függvényt, és másold ki a naplóból a kulcsot.
 *   2. Telepítsd webalkalmazásként (Végrehajtás: Én, Hozzáférés: Bárki).
 */

const FILE_NAME = 'kau_belepteto_sync.json';

/** Egyszer kell futtatni a szerkesztőből: kulcsot generál és létrehozza a fájlt. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  const file = getFile_();
  Logger.log('Szinkronfájl a Drive-on: ' + file.getName() + ' (' + file.getUrl() + ')');
  Logger.log('Hozzáférési kulcs: ' + token);
}

/** Új kulcsot generál (ha a régi kiszivárgott). Utána minden gépen át kell írni. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

/** Böngészőben megnyitva ellenőrizhető, hogy a telepítés működik-e. */
function doGet() {
  return ContentService.createTextOutput('A KAÜ szinkron szolgáltatás működik.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents);
    const token = PropertiesService.getScriptProperties().getProperty('TOKEN');
    if (!token) return json_({ ok: false, error: 'A setup függvény még nem futott le.' });
    if (!req || req.token !== token) return json_({ ok: false, error: 'unauthorized' });

    lock.waitLock(10000);
    const file = getFile_();
    const stored = parse_(file.getBlob().getDataAsString());
    const rev = stored.rev || 0;

    if (req.action === 'get') {
      return json_({ ok: true, rev: rev, data: stored.data || null });
    }

    if (req.action === 'put') {
      // Csak akkor írunk, ha azóta más nem írta felül (optimista zárolás).
      if (req.rev !== rev) return json_({ ok: false, error: 'conflict', rev: rev });
      if (!req.data || typeof req.data !== 'object') return json_({ ok: false, error: 'Hiányzó adat.' });
      file.setContent(JSON.stringify({ rev: rev + 1, updated: new Date().toISOString(), data: req.data }));
      return json_({ ok: true, rev: rev + 1 });
    }

    return json_({ ok: false, error: 'Ismeretlen művelet.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function getFile_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FILE_ID');
  if (id) {
    try {
      const f = DriveApp.getFileById(id);
      if (!f.isTrashed()) return f;
    } catch (err) { /* törölve, újat hozunk létre */ }
  }
  const file = DriveApp.createFile(FILE_NAME, '{}', MimeType.PLAIN_TEXT);
  props.setProperty('FILE_ID', file.getId());
  return file;
}

function parse_(text) {
  try { return JSON.parse(text) || {}; } catch (err) { return {}; }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
