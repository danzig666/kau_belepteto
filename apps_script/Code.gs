/**
 * KAÜ beléptető – szinkron szolgáltatás (Google Apps Script)
 *
 * A Tampermonkey script ezen a webalkalmazáson keresztül olvassa és írja a
 * szinkronizált adatot. Az adat a projekt saját tárában (Script Properties)
 * van, és már a böngészőben titkosítva érkezik; ez a script nem ismeri a
 * titkosítási jelszót.
 *
 * A script semmilyen Google-jogosultságot (Drive, Gmail stb.) nem használ,
 * ezért futtatáskor nem kér engedélyt, és a Google sem tiltja le.
 *
 * Beállítás: lásd a README "Google szinkron" fejezetét.
 *   1. Futtasd egyszer a `setup` függvényt, és másold ki a naplóból a kulcsot.
 *   2. Telepítsd webalkalmazásként (Végrehajtás: Én, Hozzáférés: Bárki).
 */

// Egy Script Property értéke legfeljebb 9 KB lehet, ezért darabolva tároljuk.
const CHUNK_SIZE = 8000;

/** Egyszer kell futtatni a szerkesztőből: kulcsot generál és kiírja a naplóba. */
function setup() {
  const props = PropertiesService.getScriptProperties();
  let token = props.getProperty('TOKEN');
  if (!token) {
    token = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
    props.setProperty('TOKEN', token);
  }
  Logger.log('Hozzáférési kulcs: ' + token);
}

/** Új kulcsot generál (ha a régi kiszivárgott). Utána minden gépen át kell írni. */
function resetToken() {
  PropertiesService.getScriptProperties().deleteProperty('TOKEN');
  setup();
}

/** Törli a tárolt (titkosított) adatot. A következő szinkronnál a gép újra feltölti a sajátját. */
function resetData() {
  const props = PropertiesService.getScriptProperties();
  writeData_(props, null, readData_(props).rev + 1);
  Logger.log('A tárolt szinkronadat törölve.');
}

/** Böngészőben megnyitva ellenőrizhető, hogy a telepítés működik-e. */
function doGet() {
  return ContentService.createTextOutput('A KAÜ szinkron szolgáltatás működik.');
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    const req = JSON.parse(e.postData.contents);
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('TOKEN');
    if (!token) return json_({ ok: false, error: 'A setup függvény még nem futott le.' });
    if (!req || req.token !== token) return json_({ ok: false, error: 'unauthorized' });

    lock.waitLock(10000);
    const stored = readData_(props);

    if (req.action === 'get') {
      return json_({ ok: true, rev: stored.rev, data: stored.data });
    }

    if (req.action === 'put') {
      // Csak akkor írunk, ha azóta más nem írta felül (optimista zárolás).
      if (req.rev !== stored.rev) return json_({ ok: false, error: 'conflict', rev: stored.rev });
      if (!req.data || typeof req.data !== 'object') return json_({ ok: false, error: 'Hiányzó adat.' });
      writeData_(props, req.data, stored.rev + 1);
      return json_({ ok: true, rev: stored.rev + 1 });
    }

    return json_({ ok: false, error: 'Ismeretlen művelet.' });
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message || err) });
  } finally {
    lock.releaseLock();
  }
}

function readData_(props) {
  const all = props.getProperties();
  const rev = Number(all.DATA_REV) || 0;
  const n = Number(all.DATA_N) || 0;
  let text = '';
  for (let i = 0; i < n; i++) text += all['DATA_' + i] || '';
  let data = null;
  if (text) { try { data = JSON.parse(text); } catch (err) { data = null; } }
  return { rev: rev, data: data };
}

function writeData_(props, data, rev) {
  const oldCount = Number(props.getProperty('DATA_N')) || 0;
  const text = data ? JSON.stringify(data) : '';
  const values = { DATA_REV: String(rev) };
  let n = 0;
  for (let i = 0; i < text.length; i += CHUNK_SIZE) values['DATA_' + (n++)] = text.slice(i, i + CHUNK_SIZE);
  values.DATA_N = String(n);
  props.setProperties(values);
  for (let i = n; i < oldCount; i++) props.deleteProperty('DATA_' + i);
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
