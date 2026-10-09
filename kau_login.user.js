// ==UserScript==
// @name         KAÜ (Ügyfélkapu+) automata beléptető
// @namespace    http://tampermonkey.net/
// @version      2.7.0
// @description  Többprofilos automatikus belépés KAÜ oldalakkal, export/import, Google szinkron, autologin
// @author       danzig666
// @homepageURL  https://github.com/danzig666/kau_belepteto
// @downloadURL  https://raw.githubusercontent.com/danzig666/kau_belepteto/main/kau_login.user.js
// @updateURL    https://raw.githubusercontent.com/danzig666/kau_belepteto/main/kau_login.user.js
// @match        *://*.oeny.hu/*
// @match        *://kau.gov.hu/*
// @match        *://idp.gov.hu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      script.google.com
// @connect      script.googleusercontent.com
// @noframes
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const SCRIPT_VERSION = '2.7.0';

  // A v2.6.5-ig a @name tartalmazta a verziószámot, ezért a Tampermonkey minden
  // kiadást KÜLÖN scriptként telepített, KÜLÖN GM adattárral. Ilyenkor több
  // példány fut egyszerre ugyanazon az oldalon, és a régi példány a saját,
  // elavult adataival írja felül az űrlapot. Csak egy példány futhat.
  const instanceMarker = document.documentElement;
  if (instanceMarker.dataset.kauLoginActive) {
    console.warn(
      `[KAU v${SCRIPT_VERSION}] Ezen az oldalon már fut egy másik példány ` +
      `(v${instanceMarker.dataset.kauLoginActive}), ezért ez a példány leáll. ` +
      'Nyisd meg a Tampermonkey irányítópultot, és töröld a duplikált (régi verziójú) scripteket!'
    );
    return;
  }
  instanceMarker.dataset.kauLoginActive = SCRIPT_VERSION;

  let autoLoginGeneration = 0;
  let activeCountdownTimer = null;

  const I18N = {
    managerBtn: "KAÜ Kezelő",
    managerTitle: "KAÜ kezelő beállítások",
    managerDesc: "Válasszon ki egy profilt az automatikus belépés engedélyezéséhez.",
    addNewProfile: "Új profil hozzáadása",
    aliasLabel: "Alias (rövid név)",
    aliasPlaceholder: "pl. Személyes Fiók",
    usernameLabel: "Felhasználónév",
    passwordLabel: "Jelszó",
    totpLabel: "TOTP kód vagy otpauth:// URI",
    saveNewBtn: "Új mentése",
    closeBtn: "Bezárás",
    deleteBtn: "Törlés",
    setAutoLoginBtn: "Alapértelmezett",
    disableAutoLoginBtn: "Autologin kikapcsolása",
    enableAutoLoginBtn: "Autologin bekapcsolása",
    autoLoginStatusOn: "Autologin: BE",
    autoLoginStatusOff: "Autologin: KI",
    loginNowBtn: "Belépés most",
    allFieldsRequired: "Minden mező kitöltése kötelező.",
    deleteConfirm: (alias) => `Biztosan törli a(z) "${alias}" profilt?`,
    noProfilesSaved: "Még nincsenek mentett profilok.",
    selectProfileTitle: "Válasszon profilt a belépéshez",
    loginAs: (alias, username) => `Belépés mint <strong>${alias}</strong> (${username})`,
    countdownText: (s, alias) => `Automatikus belépés a(z) <strong>${alias}</strong> profillal <span id="kau-countdown">${s}</span> másodperc múlva...`,
    selectToContinue: "Válasszon egy profilt a folytatáshoz.",
    manageCredsBtn: "Adatok kezelése",
    manualLoginBtn: "Mégse / kézi Belépés",
    loginError: "KAÜ automatikus belépés sikertelen. Ellenőrizze a belépési adatokat, vagy lépjen be kézzel.",
    exportBtn: "Exportálás fájlba",
    importBtn: "Importálás fájlból",
    importSuccess: "Importálás kész.",
    importReport: (ok, skipped) => skipped.length
      ? `Importálás kész: ${ok} profil beolvasva.\n\nKihagyva (hiányos vagy hibás adat): ${skipped.join(', ')}`
      : `Importálás kész: ${ok} profil beolvasva.`,
    importNothing: "Nem volt egyetlen érvényes profil sem. Szükséges mezők: felhasználónév, jelszó és érvényes Base32 TOTP titok.",
    invalidTotp: "Érvénytelen TOTP titok. Base32 kód (A-Z, 2-7) vagy otpauth:// URI szükséges.",
    importInvalid: "Érvénytelen import fájl.",
    importError: "Nem sikerült beolvasni az import fájlt.",
    securityNote: "Megjegyzés: az exportált fájl jelszavakat is tartalmaz, kezeld bizalmasan.",

    syncTitle: "Google szinkron",
    syncNowBtn: "Szinkron most",
    syncSettingsBtn: "Szinkron beállítások",
    syncUrlLabel: "Apps Script webalkalmazás URL (…/exec)",
    syncTokenLabel: "Hozzáférési kulcs (az Apps Script végrehajtási naplójából)",
    syncPassLabel: "Titkosítási jelszó (legalább 6 karakter)",
    syncAutoLabel: "Automatikus szinkron (a kezelő megnyitásakor, módosítás után és a KAÜ oldal betöltésekor)",
    syncSaveBtn: "Mentés és szinkron",
    syncDisableBtn: "Szinkron kikapcsolása ezen a gépen",
    syncDisableConfirm: "Kikapcsolja a szinkront ezen a gépen? A helyi profilok és a Google-fiókban tárolt adatok megmaradnak.",
    syncNote: "A profilok titkosítva kerülnek a Google-fiókjába (a saját Apps Script projektjébe). A titkosítási jelszó csak ezen a gépen tárolódik, minden gépen ugyanazt kell megadni.",
    syncStatusOff: "Szinkron: nincs beállítva",
    syncStatusNever: "Szinkron: még nem futott",
    syncStatusBusy: "Szinkron folyamatban…",
    syncStatusOk: (t) => `Utolsó szinkron: ${t}`,
    syncStatusErr: (m) => `Szinkron hiba: ${m}`,
    syncInvalidUrl: "Érvénytelen URL. A webalkalmazás URL-je így néz ki: https://script.google.com/macros/s/…/exec",
    syncTokenRequired: "A hozzáférési kulcs megadása kötelező.",
    syncPassTooShort: "A titkosítási jelszónak legalább 6 karakter hosszúnak kell lennie.",
    syncNotConfigured: "A szinkron nincs beállítva. Adja meg az adatokat a „Szinkron beállítások” részben.",
    syncFailed: (m) => `A szinkron nem sikerült:\n\n${m}`,
    syncErrNetwork: "Nem érhető el a szerver (hálózati hiba vagy időtúllépés).",
    syncErrNotJson: "A szerver nem a várt választ adta. Ellenőrizze az URL-t, és hogy a telepítésnél a hozzáférés „Bárki” (Anyone) legyen.",
    syncErrToken: "Hibás hozzáférési kulcs.",
    syncErrServer: (e) => `Szerverhiba: ${e}`,
    syncErrDecrypt: "Nem sikerült visszafejteni a tárolt adatokat. Hibás a titkosítási jelszó? A tárolt adatok nem lettek felülírva.",
    syncErrFormat: "Ismeretlen tárolt adatformátum (lehet, hogy újabb scriptverzió írta).",
    syncErrConflict: "Egy másik eszköz épp most módosította az adatokat. Próbálja újra."
  };

  GM_addStyle(`
    :root { --kau-font: 'Segoe UI', Arial, sans-serif; }
    #kau-manager-btn {
      position: fixed; top: 10px; right: 10px; z-index: 2147483646;
      background-color: #007bff; color: #fff; border: none; padding: 10px 15px;
      border-radius: 6px; cursor: pointer; font-family: var(--kau-font); font-size: 14px;
      box-shadow: 0 2px 5px rgba(0,0,0,.2);
    }
  `);

  const KEYS = { CREDS: 'kau_creds', FLOW: 'kau_active_flow', SYNC: 'kau_sync' };
  const FLOW_TTL_MS = 3 * 60 * 1000;
  const CHOOSER_RESET_AGE_MS = 60 * 1000;

  const Storage = {
    getCreds() {
      const d = JSON.parse(GM_getValue(KEYS.CREDS, '{"profiles":{}, "autoLoginProfile": null, "autoLoginEnabled": true}'));
      if (typeof d.autoLoginEnabled !== 'boolean') d.autoLoginEnabled = true;
      if (!d.profiles) d.profiles = {};
      // Szinkronhoz: törölt profilok időbélyegei és az alapértelmezett profil
      // utolsó módosítása. A v2.7.0 előtti adatokban még nincsenek meg.
      if (!d.deleted || typeof d.deleted !== 'object') d.deleted = {};
      if (typeof d.settingsUpdatedAt !== 'number') d.settingsUpdatedAt = 0;
      return d;
    },
    saveCreds(d) { GM_setValue(KEYS.CREDS, JSON.stringify(d)); },
    getFlow() { try { return JSON.parse(GM_getValue(KEYS.FLOW, null) || 'null'); } catch { return null; } },
    setFlow(obj) { GM_setValue(KEYS.FLOW, JSON.stringify(obj)); },
    clearFlow() { GM_deleteValue(KEYS.FLOW); },
    getSync() { try { return JSON.parse(GM_getValue(KEYS.SYNC, null) || 'null'); } catch { return null; } },
    saveSync(cfg) { GM_setValue(KEYS.SYNC, JSON.stringify(cfg)); },
    clearSync() { GM_deleteValue(KEYS.SYNC); }
  };

  function isSafeAlias(alias) {
    return !!alias && alias !== '__proto__' && alias !== 'constructor' && alias !== 'prototype';
  }

  // Minden profilmódosítás ezeken megy át, hogy a szinkron időbélyegek alapján
  // el tudja dönteni, melyik gépen történt a későbbi változtatás.
  function putProfile(d, alias, entry) {
    d.profiles[alias] = Object.assign({}, entry, { updatedAt: Date.now() });
    delete d.deleted[alias];
  }
  function setAutoLoginProfile(d, alias) {
    if (d.autoLoginProfile === alias) return;
    d.autoLoginProfile = alias;
    d.settingsUpdatedAt = Date.now();
  }
  function removeProfile(d, alias) {
    delete d.profiles[alias];
    d.deleted[alias] = Date.now();
    if (d.autoLoginProfile === alias) {
      const ks = Object.keys(d.profiles);
      setAutoLoginProfile(d, ks.length === 1 ? ks[0] : null);
    }
  }

  // --- TOTP titok normalizálás -----------------------------------------
  // Base32 titok tisztítása: szóköz/kötőjel el, '=' padding le, nagybetűsítés.
  function sanitizeBase32(v) {
    const clean = String(v == null ? '' : v).replace(/[\s\-_]/g, '').replace(/=+$/, '').toUpperCase();
    return /^[A-Z2-7]{8,}$/.test(clean) ? clean : null;
  }

  // Titok kinyerése otpauth:// URI-ból. Nem támaszkodik kizárólag a URL API-ra,
  // mert az otpauth nem "special" séma, és a kézzel szerkesztett fájlokban
  // gyakran más alakban áll a titok.
  function extractTotpSecret(uri) {
    if (!uri) return null;
    let raw = null;
    try { raw = new URL(uri).searchParams.get('secret'); } catch (e) { /* nem valid URL */ }
    if (!raw) {
      const m = /[?&]secret=([^&#]+)/i.exec(String(uri));
      if (m) { try { raw = decodeURIComponent(m[1]); } catch (e) { raw = m[1]; } }
    }
    if (!raw) raw = uri; // csupasz Base32 titok is elfogadott
    return sanitizeBase32(raw);
  }

  function buildTotpUri(username, raw) {
    const v = String(raw || '').trim();
    if (/^otpauth:\/\//i.test(v)) return v;
    return `otpauth://totp/${encodeURIComponent(username)}?secret=${encodeURIComponent(v)}`;
  }

  // Import bejegyzés normalizálása: többféle mezőnevet is elfogad,
  // és mindig kanonikus { username, password, totp_uri } alakot ad vissza.
  function normalizeProfileEntry(entry) {
    if (!entry || typeof entry !== 'object') return null;
    const username = typeof entry.username === 'string' ? entry.username.trim() : '';
    const password = typeof entry.password === 'string' ? entry.password : '';
    if (!username || !password) return null;
    const rawTotp = [entry.totp_uri, entry.totpUri, entry.otpauth, entry.totp, entry.secret]
      .find(v => typeof v === 'string' && v.trim());
    if (!rawTotp) return null;
    const uri = buildTotpUri(username, rawTotp);
    if (!extractTotpSecret(uri)) return null; // olvashatatlan titok -> ne mentsuk csendben
    return { username, password, totp_uri: uri };
  }

  const TOTP = {
    async totp(secretB32, step = 30, digits = 6) { return this.hotp(this._unbase32(secretB32), this._pack64(Date.now()/1000/step), digits); },
    async hotp(keyBytes, counterBuf, digits) {
      const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
      const sig = await crypto.subtle.sign('HMAC', key, counterBuf);
      return this._truncate(sig, digits);
    },
    _truncate(buf, digits) {
      const a = new Uint8Array(buf); const off = a[19] & 0xf;
      const bin = ((a[off] & 0x7f) << 24) | (a[off + 1] << 16) | (a[off + 2] << 8) | a[off + 3];
      return String(bin % (10 ** digits)).padStart(digits, '0');
    },
    _unbase32(s) {
      const alphabet = 'abcdefghijklmnopqrstuvwxyz234567';
      const cleaned = sanitizeBase32(s);
      if (!cleaned) throw new Error('Érvénytelen Base32 TOTP titok.');
      const bits = cleaned.toLowerCase().split('').map(c => {
        const i = alphabet.indexOf(c); if (i < 0) throw new Error(`Érvénytelen Base32 karakter: ${c}`);
        return i.toString(2).padStart(5, '0');
      }).join('');
      const bytes = bits.match(/.{8}/g) || [];
      return new Uint8Array(bytes.map(b => parseInt(b, 2)));
    },
    _pack64(val) { const b = new ArrayBuffer(8), dv = new DataView(b), hi = Math.floor(val/2**32), lo = Math.floor(val%2**32); dv.setUint32(0, hi); dv.setUint32(4, lo); return b; }
  };

  // --- Google szinkron ------------------------------------------------
  // Az adatok a felhasználó saját Google Apps Script webalkalmazásán keresztül
  // kerülnek a Google-fiókjába (lásd README és apps_script/Code.gs). Feltöltés előtt
  // AES-GCM-mel titkosítunk, a kulcs a titkosítási jelszóból PBKDF2-vel
  // származik, így a szerveren csak olvashatatlan adat van.
  const SYNC_MIN_PASS_LEN = 6;
  const SYNC_PBKDF2_ITER = 600000;
  const SYNC_URL_RE = /^https:\/\/script\.google\.com\/.+\/exec\/?$/;
  const AUTO_SYNC_MIN_INTERVAL_MS = 60 * 1000;
  const AUTO_SYNC_DEBOUNCE_MS = 1500;

  class SyncError extends Error {
    constructor(message, code) { super(message); this.code = code; }
  }

  function syncConfigured(cfg) {
    return !!(cfg && cfg.url && cfg.token && cfg.passphrase && cfg.passphrase.length >= SYNC_MIN_PASS_LEN);
  }

  const B64 = {
    enc(u8) {
      let s = '';
      for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode.apply(null, u8.subarray(i, i + 0x8000));
      return btoa(s);
    },
    dec(str) {
      const s = atob(str); const u8 = new Uint8Array(s.length);
      for (let i = 0; i < s.length; i++) u8[i] = s.charCodeAt(i);
      return u8;
    }
  };

  const SyncCrypto = {
    async _key(passphrase, salt, iterations) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(passphrase), 'PBKDF2', false, ['deriveKey']);
      return crypto.subtle.deriveKey(
        { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']
      );
    },
    async encrypt(obj, passphrase) {
      const salt = crypto.getRandomValues(new Uint8Array(16));
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await this._key(passphrase, salt, SYNC_PBKDF2_ITER);
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
      return { v: 1, kdf: 'PBKDF2-SHA256', iter: SYNC_PBKDF2_ITER, salt: B64.enc(salt), iv: B64.enc(iv), ct: B64.enc(new Uint8Array(ct)) };
    },
    async decrypt(env, passphrase) {
      if (!env || env.v !== 1 || env.kdf !== 'PBKDF2-SHA256' || !env.salt || !env.iv || !env.ct || !(env.iter > 0)) {
        throw new SyncError(I18N.syncErrFormat, 'format');
      }
      try {
        const key = await this._key(passphrase, B64.dec(env.salt), env.iter);
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: B64.dec(env.iv) }, key, B64.dec(env.ct));
        return JSON.parse(new TextDecoder().decode(pt));
      } catch (e) {
        throw new SyncError(I18N.syncErrDecrypt, 'decrypt');
      }
    }
  };

  // A webalkalmazás minden kérést POST-ként kap, így a hozzáférési kulcs nem
  // kerül URL-be. Sütik nélkül küldjük (anonymous), mert a "Bárki" hozzáférésű
  // telepítésnek nincs rájuk szüksége, és több bejelentkezett Google-fióknál
  // zavart okozhatnak.
  function syncRequest(cfg, payload) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'POST',
        url: cfg.url,
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        data: JSON.stringify(Object.assign({ token: cfg.token }, payload)),
        anonymous: true,
        timeout: 30000,
        onload: (r) => {
          let body = null;
          try { body = JSON.parse(r.responseText); } catch (e) { /* pl. Google bejelentkező oldal */ }
          if (!body || typeof body !== 'object') { reject(new SyncError(I18N.syncErrNotJson, 'http')); return; }
          if (body.ok) { resolve(body); return; }
          if (body.error === 'unauthorized') reject(new SyncError(I18N.syncErrToken, 'auth'));
          else if (body.error === 'conflict') reject(new SyncError(I18N.syncErrConflict, 'conflict'));
          else reject(new SyncError(I18N.syncErrServer(body.error), 'server'));
        },
        onerror: () => reject(new SyncError(I18N.syncErrNetwork, 'network')),
        ontimeout: () => reject(new SyncError(I18N.syncErrNetwork, 'network'))
      });
    });
  }

  // A szinkronizált rész. Az autologin BE/KI kapcsoló szándékosan gépenként
  // külön marad (pl. munkahelyi gépen ki lehet kapcsolva).
  function toSyncPayload(p) {
    const out = { profiles: {}, deleted: {}, autoLoginProfile: null, settingsUpdatedAt: 0 };
    if (!p || typeof p !== 'object') return out;
    if (p.profiles && typeof p.profiles === 'object') {
      for (const [alias, entry] of Object.entries(p.profiles)) {
        if (!isSafeAlias(alias)) continue;
        const norm = normalizeProfileEntry(entry);
        if (!norm) continue;
        norm.updatedAt = Number(entry.updatedAt) || 0;
        out.profiles[alias] = norm;
      }
    }
    if (p.deleted && typeof p.deleted === 'object') {
      for (const [alias, ts] of Object.entries(p.deleted)) {
        if (isSafeAlias(alias) && Number(ts) > 0) out.deleted[alias] = Number(ts);
      }
    }
    if (typeof p.autoLoginProfile === 'string') out.autoLoginProfile = p.autoLoginProfile;
    out.settingsUpdatedAt = Number(p.settingsUpdatedAt) || 0;
    return out;
  }

  // Profilonként a későbbi módosítás nyer (mentés vagy törlés). Egyenlő
  // időbélyegnél (pl. régi, időbélyeg nélküli profilok) a szerveren lévő
  // változat nyer, így minden gép ugyanarra az állapotra áll be.
  // remote === null: a szerveren még nincs adat, ilyenkor a helyi az irányadó.
  function mergeSyncPayloads(local, remote) {
    if (!remote) return mergeSyncPayloads(toSyncPayload(null), local);
    const out = { profiles: {}, deleted: {}, autoLoginProfile: null, settingsUpdatedAt: 0 };
    const aliases = new Set([
      ...Object.keys(local.profiles), ...Object.keys(local.deleted),
      ...Object.keys(remote.profiles), ...Object.keys(remote.deleted)
    ]);
    for (const alias of aliases) {
      const lp = local.profiles[alias], rp = remote.profiles[alias];
      const prof = rp && (!lp || rp.updatedAt >= lp.updatedAt) ? rp : lp;
      const deletedAt = Math.max(local.deleted[alias] || 0, remote.deleted[alias] || 0);
      if (prof && prof.updatedAt >= deletedAt) out.profiles[alias] = prof;
      else out.deleted[alias] = deletedAt;
    }
    const s = remote.settingsUpdatedAt >= local.settingsUpdatedAt ? remote : local;
    out.autoLoginProfile = s.autoLoginProfile;
    out.settingsUpdatedAt = s.settingsUpdatedAt;
    if (!out.autoLoginProfile || !out.profiles[out.autoLoginProfile]) {
      const ks = Object.keys(out.profiles);
      out.autoLoginProfile = ks.length === 1 ? ks[0] : null;
    }
    return out;
  }

  function stableStringify(v) {
    if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
    if (v && typeof v === 'object') {
      return '{' + Object.keys(v).sort().map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
    }
    return JSON.stringify(v);
  }

  let syncBusy = false;
  let syncChain = Promise.resolve();
  let autoSyncTimer = null;

  async function doSync() {
    const cfg = Storage.getSync();
    if (!syncConfigured(cfg)) throw new SyncError(I18N.syncNotConfigured, 'config');
    cfg.lastAttemptAt = Date.now();
    Storage.saveSync(cfg);
    syncBusy = true;
    refreshSyncStatusUI();
    try {
      // Ütközés (közben egy másik gép írt) esetén újra letöltjük és összefésüljük.
      for (let attempt = 0; attempt < 3; attempt++) {
        const got = await syncRequest(cfg, { action: 'get' });
        const remote = got.data ? toSyncPayload(await SyncCrypto.decrypt(got.data, cfg.passphrase)) : null;
        const localData = Storage.getCreds();
        const local = toSyncPayload(localData);
        const merged = mergeSyncPayloads(local, remote);
        const mergedStr = stableStringify(merged);

        const changedLocal = mergedStr !== stableStringify(local);
        if (changedLocal) { Object.assign(localData, merged); Storage.saveCreds(localData); }

        const uploaded = !remote || mergedStr !== stableStringify(remote);
        if (uploaded) {
          const data = await SyncCrypto.encrypt(merged, cfg.passphrase);
          try { await syncRequest(cfg, { action: 'put', rev: got.rev, data }); }
          catch (e) { if (e.code === 'conflict') continue; throw e; }
        }

        const c = Storage.getSync();
        if (c) { c.lastSyncAt = Date.now(); c.lastError = null; Storage.saveSync(c); }
        console.info(`[KAU v${SCRIPT_VERSION}] Szinkron kész: helyi változás=${changedLocal}, feltöltve=${uploaded}`);
        return { changedLocal, uploaded };
      }
      throw new SyncError(I18N.syncErrConflict, 'conflict');
    } catch (e) {
      const c = Storage.getSync();
      if (c) { c.lastError = e.message; Storage.saveSync(c); }
      throw e;
    } finally {
      syncBusy = false;
      refreshSyncStatusUI();
    }
  }

  // A szinkronok sorban futnak, így egy futás közbeni helyi módosítás a
  // következő körben biztosan feltöltődik.
  function runSync(interactive) {
    const p = syncChain.then(() => doSync());
    syncChain = p.catch(() => {});
    return p.then(res => {
      if (res.changedLocal) onSyncChangedLocal();
      return res;
    }, err => {
      console.warn('[KAU] Szinkron hiba:', err);
      if (interactive) alert(I18N.syncFailed(err.message));
      return null;
    });
  }

  function scheduleAutoSync() {
    const cfg = Storage.getSync();
    if (!syncConfigured(cfg) || !cfg.autoSync) return;
    clearTimeout(autoSyncTimer);
    autoSyncTimer = setTimeout(() => runSync(false), AUTO_SYNC_DEBOUNCE_MS);
  }

  function maybeBackgroundSync() {
    const cfg = Storage.getSync();
    if (!syncConfigured(cfg) || !cfg.autoSync) return;
    if (Date.now() - (cfg.lastAttemptAt || 0) < AUTO_SYNC_MIN_INTERVAL_MS) return;
    runSync(false);
  }

  // A szinkron új/módosított profilokat hozott: frissítjük a nyitott felületet.
  function onSyncChangedLocal() {
    const root = managerRoot();
    if (root) refreshManagerState(root);
    if (onKauChooserPage() && !isManagerOpen() && !getValidFlow()) {
      const chooser = document.getElementById('kau-shadow-host-selection');
      if (chooser) { autoLoginGeneration++; chooser.remove(); }
      maybeShowSelectionModalOnce();
    }
  }

  // Hardened single-click handler
  function attachButton(el, handler) {
    const wrap = (e) => {
      try { e.preventDefault(); e.stopPropagation(); if (e.stopImmediatePropagation) e.stopImmediatePropagation(); handler(e); }
      catch (err) { console.error('[KAU] Button handler error:', err); }
    };
    el.addEventListener('click', wrap, { capture: true });
  }

  // Shadow host helpers
  function createShadowHost(id = 'kau-shadow-host') {
    let host = document.getElementById(id);
    if (host) host.remove();
    host = document.createElement('div');
    host.id = id;
    Object.assign(host.style, { position: 'fixed', inset: '0', zIndex: '2147483647', pointerEvents: 'none' });
    document.documentElement.appendChild(host);
    const root = host.attachShadow({ mode: 'open' });
    return { host, root, destroy: () => host.remove() };
  }

  // Detect open modals (to avoid chooser popping above manager)
  function isManagerOpen() { return !!document.getElementById('kau-shadow-host-manager'); }
  function isChooserOpen() { return !!document.getElementById('kau-shadow-host-selection'); }

  // === Responsive, mobilbarát modal CSS ===
  function modalStyles() {
    return `
      :host { all: initial; }
      * { box-sizing: border-box; font-family: 'Segoe UI', Arial, sans-serif; }
      .overlay { position: fixed; inset: 0; background: rgba(0,0,0,.55); pointer-events: auto; }
      .modal {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        background: #f9f9f9; padding: 24px; border-radius: 10px; box-shadow: 0 10px 30px rgba(0,0,0,.25);
        width: 640px; max-width: 95%;
        max-height: 90vh; overflow: auto;  /* görgethető */
        pointer-events: auto;
      }
      h2, h3 { margin: 0 0 10px; color: #222; }
      p.note { margin: 8px 0 14px; color: #7a7a7a; font-size: 12px; }
      .form-group { margin-bottom: 12px; }
      label { display:block; margin-bottom: 6px; font-weight:600; color:#444; }
      input { width: 100%; padding: 10px; border: 1px solid #ccc; border-radius: 6px; font-size: 15px; }
      .btn-row { display:flex; gap: 10px; flex-wrap: wrap; margin: 8px 0 14px; align-items:center; }
      .btn-group { display:flex; justify-content:flex-end; margin-top: 20px; gap: 10px; flex-wrap: wrap; }
      button { padding: 10px 14px; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 700; background: #e0e0e0; color: #111; }
      .btn-primary { background:#007bff; color:#fff; }
      .btn-secondary { background:#6c757d; color:#fff; }
      .btn-danger { background:#dc3545; color:#fff; }
      .btn-neutral { background:#e0e0e0; color:#111; }
      .status-pill { padding: 8px 10px; border-radius: 999px; background:#f1f1f1; font-size: 12px; }
      .status-pill.err { background:#fde2e4; color:#842029; }
      [hidden] { display:none !important; }
      button:disabled { opacity: .6; cursor: default; }
      label.check { display:flex; gap:8px; align-items:center; font-weight:400; }
      label.check input { width:auto; margin:0; }
      .cred-list { max-height: 260px; overflow-y:auto; border:1px solid #eee; padding: 8px; background:#fff; border-radius: 6px;}

      /* Asztali: alias + 3 gomb egy sorban */
      .cred-item {
        display:grid; grid-template-columns: 1fr auto auto auto; gap: 8px;
        align-items:center; padding:8px; border-bottom:1px solid #f0f0f0;
      }
      .cred-item.auto-login { background:#e8ffe8; font-weight:600; }
      .cred-item .alias { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

      .cred-select-btn { display:block; width:100%; text-align:left; padding:14px; margin-bottom:10px; background:#fff; border:1px solid #ccc; border-radius: 8px; cursor:pointer; font-size:16px; }
      .cred-select-btn:hover { background:#f5f5f5; }
      .cred-select-btn.auto-login-profile { border-left: 5px solid #28a745; }
      .countdown-text { text-align:center; margin: 14px 0 8px; font-size: 14px; color:#666; }
      #kau-countdown { font-weight: 700; font-size: 16px; }
      input[type="file"] { display: none; }

      /* === Mobil (szűk kijelző) optimalizációk === */
      @media (max-width: 520px) {
        .modal { width: 96vw; padding: 16px; }
        .cred-list { max-height: 56vh; }
        button { padding: 9px 12px; font-size: 13px; }
        .cred-select-btn { font-size: 15px; padding: 12px; }

        /* A profil sorok egy oszlopra váltanak:
           1. sor: alias teljes szélességen
           2-4. sor: gombok külön sorokban, 100% szélességen */
        .cred-item {
          display: grid;
          grid-template-columns: 1fr;
          grid-auto-rows: auto;
          gap: 6px;
          align-items: stretch;
        }
        .cred-item .alias {
          white-space: normal;           /* ne vágjuk el, tördelhető legyen */
          overflow: visible;
        }
        .cred-item > button {
          width: 100%;
          justify-self: stretch;
        }

        /* Alsó gombsor is törhető legyen */
        .btn-group { justify-content: stretch; }
        .btn-group > button { flex: 1 1 auto; }
      }
    `;
  }

  function injectManagerButton() {
    if (document.getElementById('kau-manager-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'kau-manager-btn';
    btn.textContent = I18N.managerBtn;
    btn.addEventListener('click', buildManagerUI);
    document.body.appendChild(btn);
  }

  // Export / Import
  function exportCredsToFile() {
    const data = Storage.getCreds();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    a.download = `kau_creds_${ts}.json`;
    a.href = url;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  function importCredsFromFile(file, onDone) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(reader.result);
        if (!obj || typeof obj !== 'object' || !obj.profiles || typeof obj.profiles !== 'object') {
          alert(I18N.importInvalid); return;
        }
        const current = Storage.getCreds();
        const skipped = [];
        let imported = 0;
        for (const [rawAlias, entry] of Object.entries(obj.profiles)) {
          const alias = String(rawAlias).trim();
          if (!isSafeAlias(alias)) { skipped.push(String(rawAlias)); continue; }
          const norm = normalizeProfileEntry(entry);
          if (!norm) { skipped.push(alias); continue; }
          putProfile(current, alias, norm);
          imported++;
        }
        if (typeof obj.autoLoginEnabled === 'boolean') current.autoLoginEnabled = obj.autoLoginEnabled;
        if (obj.autoLoginProfile && current.profiles[obj.autoLoginProfile]) {
          setAutoLoginProfile(current, obj.autoLoginProfile);
        } else if (!current.autoLoginProfile || !current.profiles[current.autoLoginProfile]) {
          // Csak akkor állítunk be magunktól alapértelmezettet, ha egyetlen profil
          // van. Több profilnál a felhasználó válasszon, különben a visszaszámláló
          // csendben egy másik fiókkal lépne be.
          const ks = Object.keys(current.profiles);
          setAutoLoginProfile(current, ks.length === 1 ? ks[0] : null);
        }
        Storage.saveCreds(current);
        // FONTOS: a futó belépési folyamat a régi adatokra hivatkozik, és amíg
        // él, elnyomja a profilválasztót is. Importáláskor el kell dobni.
        Storage.clearFlow();
        autoLoginGeneration++;
        if (imported === 0) { alert(I18N.importNothing); return; }
        scheduleAutoSync();
        alert(I18N.importReport(imported, skipped));
        onDone && onDone();
      } catch (e) { console.error('[KAU] Import parse error:', e); alert(I18N.importError); }
    };
    reader.onerror = () => { console.error('[KAU] Import read error:', reader.error); alert(I18N.importError); };
    reader.readAsText(file, 'utf-8');
  }

  // Manager UI (scrollable)
  function buildManagerUI() {
    autoLoginGeneration++; // cancel any countdowns
    const { root, destroy } = createShadowHost('kau-shadow-host-manager');
    const style = document.createElement('style'); style.textContent = modalStyles();
    const overlay = document.createElement('div'); overlay.className = 'overlay';
    const modal = document.createElement('div'); modal.className = 'modal';

    const creds = Storage.getCreds();
    const statusText = creds.autoLoginEnabled ? I18N.autoLoginStatusOn : I18N.autoLoginStatusOff;
    const toggleText = creds.autoLoginEnabled ? I18N.disableAutoLoginBtn : I18N.enableAutoLoginBtn;

    modal.innerHTML = `
      <h2>${I18N.managerTitle}</h2>
      <p>${I18N.managerDesc}</p>

      <div class="btn-row">
        <span class="status-pill" id="kau-autologin-status">${statusText}</span>
        <button type="button" class="btn-neutral" id="kau-toggle-autologin">${toggleText}</button>
        <button type="button" class="btn-neutral" id="kau-export">${I18N.exportBtn}</button>
        <button type="button" class="btn-neutral" id="kau-import">${I18N.importBtn}</button>
        <input type="file" id="kau-import-file" accept="application/json">
      </div>
      <p class="note">${I18N.securityNote}</p>

      <h3>${I18N.syncTitle}</h3>
      <div class="btn-row">
        <span class="status-pill" id="kau-sync-status"></span>
        <button type="button" class="btn-primary" id="kau-sync-now">${I18N.syncNowBtn}</button>
        <button type="button" class="btn-neutral" id="kau-sync-toggle">${I18N.syncSettingsBtn}</button>
      </div>
      <div id="kau-sync-settings" hidden>
        <div class="form-group"><label for="kau-sync-url">${I18N.syncUrlLabel}</label><input type="url" id="kau-sync-url" placeholder="https://script.google.com/macros/s/…/exec" autocomplete="off"></div>
        <div class="form-group"><label for="kau-sync-token">${I18N.syncTokenLabel}</label><input type="text" id="kau-sync-token" autocomplete="off" spellcheck="false"></div>
        <div class="form-group"><label for="kau-sync-pass">${I18N.syncPassLabel}</label><input type="password" id="kau-sync-pass" autocomplete="new-password"></div>
        <div class="form-group"><label class="check"><input type="checkbox" id="kau-sync-auto"> ${I18N.syncAutoLabel}</label></div>
        <p class="note">${I18N.syncNote}</p>
        <div class="btn-row">
          <button type="button" class="btn-primary" id="kau-sync-save">${I18N.syncSaveBtn}</button>
          <button type="button" class="btn-danger" id="kau-sync-disable">${I18N.syncDisableBtn}</button>
        </div>
      </div>
      <hr/>

      <div class="cred-list" id="kau-cred-list"></div>
      <hr/>
      <h3>${I18N.addNewProfile}</h3>
      <div class="form-group"><label for="kau-alias">${I18N.aliasLabel}</label><input type="text" id="kau-alias" placeholder="${I18N.aliasPlaceholder}"></div>
      <div class="form-group"><label for="kau-username">${I18N.usernameLabel}</label><input type="text" id="kau-username"></div>
      <div class="form-group"><label for="kau-password">${I18N.passwordLabel}</label><input type="password" id="kau-password"></div>
      <div class="form-group"><label for="kau-totp">${I18N.totpLabel}</label><input type="text" id="kau-totp"></div>
      <div class="btn-group">
        <button type="button" class="btn-primary" id="kau-save-btn">${I18N.saveNewBtn}</button>
        <button type="button" class="btn-secondary" id="kau-close-btn">${I18N.closeBtn}</button>
      </div>
    `;
    root.append(style, overlay, modal);

    const close = () => destroy();
    overlay.addEventListener('click', (e) => { if (e.target === overlay) { e.preventDefault(); e.stopPropagation(); close(); } }, { capture: true });

    attachButton(root.getElementById('kau-toggle-autologin'), () => {
      const d = Storage.getCreds();
      d.autoLoginEnabled = !d.autoLoginEnabled;
      Storage.saveCreds(d);
      autoLoginGeneration++; // cancel any existing countdowns
      root.getElementById('kau-autologin-status').textContent = d.autoLoginEnabled ? I18N.autoLoginStatusOn : I18N.autoLoginStatusOff;
      root.getElementById('kau-toggle-autologin').textContent = d.autoLoginEnabled ? I18N.disableAutoLoginBtn : I18N.enableAutoLoginBtn;
    });

    attachButton(root.getElementById('kau-export'), () => exportCredsToFile());
    const importBtn = root.getElementById('kau-import');
    const importFile = root.getElementById('kau-import-file');
    attachButton(importBtn, () => importFile.click());
    importFile.addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      importCredsFromFile(f, () => refreshManagerState(root));
      importFile.value = '';
    }, { capture: true });

    attachButton(root.getElementById('kau-close-btn'), () => close());
    attachButton(root.getElementById('kau-save-btn'), () => {
      const alias = root.getElementById('kau-alias').value.trim();
      const username = root.getElementById('kau-username').value.trim();
      const password = root.getElementById('kau-password').value;
      const totp = root.getElementById('kau-totp').value.trim();
      if (!alias || !username || !password || !totp) { alert(I18N.allFieldsRequired); return; }
      const norm = normalizeProfileEntry({ username, password, totp });
      if (!norm) { alert(I18N.invalidTotp); return; }
      const d = Storage.getCreds();
      putProfile(d, alias, norm);
      if (Object.keys(d.profiles).length === 1) setAutoLoginProfile(d, alias);
      Storage.saveCreds(d);
      Storage.clearFlow();
      autoLoginGeneration++;
      scheduleAutoSync();
      root.getElementById('kau-alias').value = '';
      root.getElementById('kau-username').value = '';
      root.getElementById('kau-password').value = '';
      root.getElementById('kau-totp').value = '';
      refreshCredList(root);
    });

    setupSyncSection(root);
    refreshCredList(root);

    // Megnyitáskor behúzzuk a többi gépen történt változásokat.
    const syncCfg = Storage.getSync();
    if (syncConfigured(syncCfg) && syncCfg.autoSync) runSync(false);
  }

  function managerRoot() {
    const host = document.getElementById('kau-shadow-host-manager');
    return host && host.shadowRoot;
  }

  function refreshSyncStatusUI() {
    const root = managerRoot(); if (!root) return;
    const pill = root.getElementById('kau-sync-status'); if (!pill) return;
    const cfg = Storage.getSync();
    let text;
    if (!syncConfigured(cfg)) text = I18N.syncStatusOff;
    else if (syncBusy) text = I18N.syncStatusBusy;
    else if (cfg.lastError) text = I18N.syncStatusErr(cfg.lastError);
    else if (cfg.lastSyncAt) text = I18N.syncStatusOk(new Date(cfg.lastSyncAt).toLocaleString('hu-HU'));
    else text = I18N.syncStatusNever;
    pill.textContent = text;
    pill.classList.toggle('err', !syncBusy && !!(cfg && cfg.lastError));
    const btn = root.getElementById('kau-sync-now');
    if (btn) btn.disabled = syncBusy;
  }

  function setupSyncSection(root) {
    const panel = root.getElementById('kau-sync-settings');
    const urlIn = root.getElementById('kau-sync-url');
    const tokenIn = root.getElementById('kau-sync-token');
    const passIn = root.getElementById('kau-sync-pass');
    const autoIn = root.getElementById('kau-sync-auto');

    const fillForm = () => {
      const cfg = Storage.getSync() || {};
      urlIn.value = cfg.url || '';
      tokenIn.value = cfg.token || '';
      passIn.value = cfg.passphrase || '';
      autoIn.checked = cfg.autoSync !== false;
    };
    fillForm();
    refreshSyncStatusUI();

    attachButton(root.getElementById('kau-sync-toggle'), () => {
      if (panel.hidden) fillForm();
      panel.hidden = !panel.hidden;
    });

    attachButton(root.getElementById('kau-sync-now'), () => {
      if (!syncConfigured(Storage.getSync())) { fillForm(); panel.hidden = false; alert(I18N.syncNotConfigured); return; }
      runSync(true);
    });

    attachButton(root.getElementById('kau-sync-save'), () => {
      const url = urlIn.value.trim();
      const token = tokenIn.value.trim();
      const passphrase = passIn.value;
      if (!SYNC_URL_RE.test(url)) { alert(I18N.syncInvalidUrl); return; }
      if (!token) { alert(I18N.syncTokenRequired); return; }
      if (passphrase.length < SYNC_MIN_PASS_LEN) { alert(I18N.syncPassTooShort); return; }
      const prev = Storage.getSync() || {};
      Storage.saveSync(Object.assign(prev, { url, token, passphrase, autoSync: autoIn.checked, lastError: null }));
      panel.hidden = true;
      refreshSyncStatusUI();
      runSync(true);
    });

    attachButton(root.getElementById('kau-sync-disable'), () => {
      if (!confirm(I18N.syncDisableConfirm)) return;
      clearTimeout(autoSyncTimer);
      Storage.clearSync();
      fillForm();
      panel.hidden = true;
      refreshSyncStatusUI();
    });
  }

  // Az import a profillistán kívül az autologin kapcsolót is módosíthatja.
  function refreshManagerState(root) {
    const d = Storage.getCreds();
    const pill = root.getElementById('kau-autologin-status');
    const toggle = root.getElementById('kau-toggle-autologin');
    if (pill) pill.textContent = d.autoLoginEnabled ? I18N.autoLoginStatusOn : I18N.autoLoginStatusOff;
    if (toggle) toggle.textContent = d.autoLoginEnabled ? I18N.disableAutoLoginBtn : I18N.enableAutoLoginBtn;
    refreshCredList(root);
  }

  function refreshCredList(root) {
    const div = root.getElementById('kau-cred-list'); if (!div) return;
    const creds = Storage.getCreds();
    div.innerHTML = '';
    const keys = Object.keys(creds.profiles);
    if (keys.length === 0) { div.innerHTML = `<p>${I18N.noProfilesSaved}</p>`; return; }

    keys.forEach(alias => {
      const p = creds.profiles[alias];
      const row = document.createElement('div');
      row.className = 'cred-item' + (alias === creds.autoLoginProfile ? ' auto-login' : '');
      row.innerHTML = `
        <span class="alias"><strong>${alias}</strong> (${p.username})</span>
        <button type="button" class="btn-primary" data-login-now="${alias}">${I18N.loginNowBtn}</button>
        <button type="button" class="btn-neutral" data-setauto="${alias}">${I18N.setAutoLoginBtn}</button>
        <button type="button" class="btn-danger" data-del="${alias}">${I18N.deleteBtn}</button>
      `;
      div.appendChild(row);
    });

    // Login Now
    div.querySelectorAll('[data-login-now]').forEach(btn => {
      attachButton(btn, () => {
        const alias = btn.getAttribute('data-login-now');
        const hostEl = document.getElementById('kau-shadow-host-manager');
        hostEl && hostEl.remove();
        startFlow(alias);
        continueLogin();
      });
    });

    // Delete
    div.querySelectorAll('[data-del]').forEach(btn => {
      attachButton(btn, () => {
        const alias = btn.getAttribute('data-del');
        if (!confirm(I18N.deleteConfirm(alias))) return;
        const d = Storage.getCreds();
        removeProfile(d, alias);
        Storage.saveCreds(d);
        // A törölt profilhoz tartozó (vagy bármely) futó folyamat érvénytelen.
        Storage.clearFlow();
        autoLoginGeneration++;
        refreshCredList(root);
        scheduleAutoSync();
      });
    });

    // Set auto-login profile
    div.querySelectorAll('[data-setauto]').forEach(btn => {
      attachButton(btn, () => {
        const alias = btn.getAttribute('data-setauto');
        const d = Storage.getCreds();
        setAutoLoginProfile(d, alias);
        Storage.saveCreds(d);
        Storage.clearFlow();
        autoLoginGeneration++;
        refreshCredList(root);
        scheduleAutoSync();
      });
    });
  }

  // Selection Modal (scrollable)
  function showSelectionModal() {
    const creds = Storage.getCreds(); const names = Object.keys(creds.profiles);
    if (names.length === 0) return;
    if (isManagerOpen()) return; // új védelem: ha manager nyitva, ne jelenjen meg

    const myGen = ++autoLoginGeneration;

    // Ha egy korábbi választóablak intervalluma még fut, állítsuk le.
    if (activeCountdownTimer) { clearInterval(activeCountdownTimer); activeCountdownTimer = null; }

    const { root, destroy } = createShadowHost('kau-shadow-host-selection');
    const style = document.createElement('style'); style.textContent = modalStyles();
    const overlay = document.createElement('div'); overlay.className = 'overlay';
    const modal = document.createElement('div'); modal.className = 'modal';

    const listHtml = names.map(alias => {
      const p = creds.profiles[alias];
      const isAuto = alias === creds.autoLoginProfile;
      return `<button type="button" class="cred-select-btn ${isAuto ? 'auto-login-profile' : ''}" data-alias="${alias}">${I18N.loginAs(alias, p.username)}</button>`;
    }).join('');

    const showCountdown = Boolean(creds.autoLoginEnabled && creds.autoLoginProfile);
    modal.innerHTML = `
      <h2>${I18N.selectProfileTitle}</h2>
      ${listHtml}
      <p class="countdown-text">${showCountdown ? I18N.countdownText(10, creds.autoLoginProfile) : I18N.selectToContinue}</p>
      <div class="btn-group">
        <button type="button" id="kau-manage" class="btn-secondary">${I18N.manageCredsBtn}</button>
        <button type="button" id="kau-cancel" class="btn-danger">${I18N.manualLoginBtn}</button>
      </div>
    `;
    root.append(style, overlay, modal);

    let countdownTimer = null;
    const close = () => {
      if (countdownTimer) clearInterval(countdownTimer);
      if (activeCountdownTimer === countdownTimer) activeCountdownTimer = null;
      destroy();
    };

    overlay.addEventListener('click', (e) => { if (e.target === overlay) { e.preventDefault(); e.stopPropagation(); close(); } }, { capture: true });

    attachButton(root.getElementById('kau-cancel'), () => { Storage.clearFlow(); autoLoginGeneration++; close(); });
    attachButton(root.getElementById('kau-manage'), () => { autoLoginGeneration++; close(); buildManagerUI(); });

    root.querySelectorAll('.cred-select-btn').forEach(btn => {
      attachButton(btn, () => {
        if (autoLoginGeneration !== myGen) return;
        const alias = btn.getAttribute('data-alias');
        startFlow(alias);
        close();
        continueLogin();
      });
    });

    if (showCountdown) {
      let s = 10;
      const el = modal.querySelector('#kau-countdown');
      countdownTimer = activeCountdownTimer = setInterval(() => {
        if (autoLoginGeneration !== myGen || !document.getElementById('kau-shadow-host-selection') || isManagerOpen()) {
          clearInterval(countdownTimer);
          return;
        }
        s--;
        if (el) el.textContent = String(s);
        if (s <= 0) {
          clearInterval(countdownTimer);
          if (autoLoginGeneration !== myGen || !document.getElementById('kau-shadow-host-selection') || isManagerOpen()) return;
          startFlow(creds.autoLoginProfile);
          close();
          continueLogin();
        }
      }, 1000);
    }
  }

  // Flow
  const Steps = Object.freeze({ start: 'start', password: 'password', totp: 'totp', done: 'done' });
  // A folyamat CSAK az aliast tárolja. Korábban a teljes profilt belemásolta a
  // GM tárba, így egy törlés+import után is a régi jelszóval/titokkal próbált belépni.
  function newFlow(alias) {
    const creds = Storage.getCreds(); if (!creds.profiles[alias]) return null;
    return { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, alias, step: Steps.start, lastHost: location.hostname, startedAt: Date.now() };
  }
  // A profilt minden lépésnél frissen olvassuk ki a tárból.
  function flowProfile(flow) {
    if (!flow || !flow.alias) { completeFlow(); return null; }
    const p = Storage.getCreds().profiles[flow.alias];
    if (!p) { console.warn('[KAU] A folyamathoz tartozó profil már nem létezik:', flow.alias); completeFlow(); return null; }
    return p;
  }
  function startFlow(alias) {
    const f = newFlow(alias);
    if (!f) { console.warn(`[KAU v${SCRIPT_VERSION}] Nincs ilyen profil: "${alias}"`); return; }
    console.info(`[KAU v${SCRIPT_VERSION}] Belépési folyamat indul: profil="${alias}"`);
    Storage.setFlow(f);
  }
  function getValidFlow() {
    const f = Storage.getFlow(); if (!f) return null;
    if ((Date.now() - (f.startedAt || 0)) > FLOW_TTL_MS) { Storage.clearFlow(); return null; }
    return f;
  }
  function updateFlow(partial) { const f = getValidFlow(); if (!f) return; Object.assign(f, partial, { lastHost: location.hostname }); Storage.setFlow(f); }
  function completeFlow() { Storage.clearFlow(); }

  // Detect pages
  function onKauDomain() { return /(^|\.)kau\.gov\.hu$/i.test(location.hostname); }
  function onKauChooserPage() {
    if (!onKauDomain()) return false;
    const txt = (document.body && document.body.innerText || '').toLowerCase();
    const hasTexts = /ügyfélkapu\+|hitelesítő alkalmazással|alkalmazással/.test(txt);
    const hasButtons = document.querySelector('button[title*="hitelesítő"], button[title*="alkalmazással"], button[aria-haspopup], [data-auth-method], a[href*="alkalmazas"]');
    return !!(hasTexts || hasButtons);
  }
  function onIdpPasswordPage() { return /(^|\.)idp\.gov\.hu$/i.test(location.hostname) && !!document.querySelector('#password') && !!document.querySelector('#name'); }
  function onIdpTotpPage() { return /(^|\.)idp\.gov\.hu$/i.test(location.hostname) && !!document.querySelector('#identifier'); }
  function onNonAuthServicePage() {
    const h = location.hostname;
    return !/(^|\.)kau\.gov\.hu$/i.test(h) && !/(^|\.)idp\.gov\.hu$/i.test(h);
  }

  // Wait helper
  function waitFor(selector, timeout = 15000) {
    return new Promise((res, rej) => {
      const t0 = performance.now();
      const tick = () => {
        const el = document.querySelector(selector);
        if (el) return res(el);
        if (performance.now() - t0 > timeout) return rej(new Error(`Nem található elem: ${selector}`));
        setTimeout(tick, 100);
      };
      tick();
    });
  }

  // Chooser: reset stale/finished flow
  function resetStaleFlowOnChooser() {
    if (!onKauChooserPage()) return;
    const f = Storage.getFlow(); if (!f) return;
    const age = Date.now() - (f.startedAt || 0);
    const shouldReset = f.step === Steps.done || f.step !== Steps.start || age > CHOOSER_RESET_AGE_MS;
    if (shouldReset) Storage.clearFlow();
  }

  // Automation
  async function continueLogin() {
    const flow = getValidFlow(); if (!flow) return;
    const profile = flowProfile(flow); if (!profile) return;

    try {
      if (onKauChooserPage() && flow.step === Steps.start) {
        const dropdownCandidate = document.querySelector('button[aria-expanded="false"], button[aria-haspopup], button[role="button"]');
        if (dropdownCandidate && dropdownCandidate.getAttribute('aria-expanded') !== 'true') dropdownCandidate.click();

        const all = Array.from(document.querySelectorAll('button, a'));
        let chosen = all.find(b => /hitelesítő|alkalmazással/i.test((b.textContent || '')));
        if (!chosen) chosen = document.querySelector('button[title*="hitelesítő"], button[title*="alkalmazással"], button[data-auth-method="app"]') || await waitFor('button, a', 10000);
        chosen && chosen.click();

        updateFlow({ step: Steps.password });
        return;
      }

      if (onIdpPasswordPage() && (flow.step === Steps.password || flow.step === Steps.start)) {
        const u = await waitFor('#name', 10000);
        const p = await waitFor('#password', 10000);
        console.info(
          `[KAU v${SCRIPT_VERSION}] Jelszó űrlap kitöltése: profil="${flow.alias}", ` +
          `felhasználónév="${profile.username}", jelszó hossza=${String(profile.password).length}`
        );
        u.value = profile.username;
        p.value = profile.password;
        u.dispatchEvent(new Event('input', { bubbles: true }));
        p.dispatchEvent(new Event('input', { bubbles: true }));
        const submit = document.querySelector('input[type="submit"][value="Bejelentkezés"], button[type="submit"]') || p.form && p.form.querySelector('[type="submit"]');
        submit ? submit.click() : (p.form && p.form.submit && p.form.submit());
        updateFlow({ step: Steps.totp });
        return;
      }

      if (onIdpTotpPage() && (flow.step === Steps.totp || flow.step === Steps.password)) {
        const totpField = await waitFor('#identifier', 10000);
        console.info(`[KAU v${SCRIPT_VERSION}] TOTP űrlap kitöltése: profil="${flow.alias}"`);
        const secret = extractTotpSecret(profile.totp_uri);
        if (!secret) throw new Error('Nem sikerült kiolvasni a TOTP secretet a tárolt URI-ból.');
        totpField.value = await TOTP.totp(secret);
        totpField.dispatchEvent(new Event('input', { bubbles: true }));
        const submit = document.querySelector('input[type="submit"][value="Bejelentkezés"], button[type="submit"]') || totpField.form && totpField.form.querySelector('[type="submit"]');
        submit && submit.click();
        updateFlow({ step: Steps.done });
        return;
      }

      if (onNonAuthServicePage() && flow.step === Steps.done) { completeFlow(); return; }

    } catch (err) {
      console.error('[KAU] Hiba az automatikus belépés közben:', err);
      completeFlow();
      alert(I18N.loginError);
    }
  }

  // Guarded selector modal trigger
  function maybeShowSelectionModalOnce() {
    resetStaleFlowOnChooser();
    if (!onKauChooserPage()) return;
    if (isManagerOpen()) return;          // <-- új védelem
    if (isChooserOpen()) return;          // ne hozzunk létre másodikat
    if (getValidFlow()) return;
    showSelectionModal();
  }

  function injectManagerButton() {
    if (document.getElementById('kau-manager-btn')) return;
    const btn = document.createElement('button');
    btn.id = 'kau-manager-btn';
    btn.textContent = I18N.managerBtn;
    btn.addEventListener('click', buildManagerUI);
    document.body.appendChild(btn);
  }

  // Main
  function main() {
    console.info(
      `[KAU v${SCRIPT_VERSION}] Indul: ${location.hostname}, ` +
      `${Object.keys(Storage.getCreds().profiles).length} profil ebben az adattárban.`
    );
    if (onKauDomain()) { injectManagerButton(); maybeBackgroundSync(); }

    if (onNonAuthServicePage()) {
      const f = Storage.getFlow();
      if (f && f.step === Steps.done) completeFlow();
      if (f && (Date.now() - (f.startedAt || 0)) > 10 * 1000) completeFlow();
      return;
    }

    if (onKauChooserPage()) {
      resetStaleFlowOnChooser();
      // Ha manager nyitva, nem indítunk automatikus UI-t
      if (!isManagerOpen()) {
        const fNow = getValidFlow();
        if (!fNow) { maybeShowSelectionModalOnce(); return; }
        continueLogin();
      }
      return;
    }

    const f = getValidFlow();
    if (f) { continueLogin(); return; }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', main); else main();

  // Fókuszváltáskor csak akkor próbáljuk meg a választó modált, ha nincs manager nyitva
  window.addEventListener('pageshow', () => setTimeout(() => { if (!isManagerOpen()) maybeShowSelectionModalOnce(); }, 150));
  window.addEventListener('focus', () => setTimeout(() => { if (!isManagerOpen()) maybeShowSelectionModalOnce(); }, 200));
})();

