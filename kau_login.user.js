// ==UserScript==
// @name         KAÜ (Ügyfélkapu+) automata beléptető (v2.6.4)
// @namespace    http://tampermonkey.net/
// @version      2.6.3
// @description  Többprofilos automatikus belépés KAÜ oldalakkal, export/import, autologin
// @match        *://*.oeny.hu/*
// @match        *://kau.gov.hu/*
// @match        *://idp.gov.hu/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_addStyle
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  let autoLoginGeneration = 0;

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
    countdownText: (s) => `Automatikus belépés az alapértelmezett profillal <span id="kau-countdown">${s}</span> másodperc múlva...`,
    selectToContinue: "Válasszon egy profilt a folytatáshoz.",
    manageCredsBtn: "Adatok kezelése",
    manualLoginBtn: "Mégse / kézi Belépés",
    loginError: "KAÜ automatikus belépés sikertelen. Ellenőrizze a belépési adatokat, vagy lépjen be kézzel.",
    exportBtn: "Exportálás fájlba",
    importBtn: "Importálás fájlból",
    importSuccess: "Importálás kész.",
    importInvalid: "Érvénytelen import fájl.",
    importError: "Nem sikerült beolvasni az import fájlt.",
    securityNote: "Megjegyzés: az exportált fájl jelszavakat is tartalmaz, kezeld bizalmasan."
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

  const KEYS = { CREDS: 'kau_creds', FLOW: 'kau_active_flow' };
  const FLOW_TTL_MS = 3 * 60 * 1000;
  const CHOOSER_RESET_AGE_MS = 60 * 1000;

  const Storage = {
    getCreds() {
      const d = JSON.parse(GM_getValue(KEYS.CREDS, '{"profiles":{}, "autoLoginProfile": null, "autoLoginEnabled": true}'));
      if (typeof d.autoLoginEnabled !== 'boolean') d.autoLoginEnabled = true;
      if (!d.profiles) d.profiles = {};
      return d;
    },
    saveCreds(d) { GM_setValue(KEYS.CREDS, JSON.stringify(d)); },
    getFlow() { try { return JSON.parse(GM_getValue(KEYS.FLOW, null) || 'null'); } catch { return null; } },
    setFlow(obj) { GM_setValue(KEYS.FLOW, JSON.stringify(obj)); },
    clearFlow() { GM_deleteValue(KEYS.FLOW); }
  };

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
      const bits = (s || '').toLowerCase().replace(/\s+/g, '').split('').map(c => {
        const i = alphabet.indexOf(c); if (i < 0) throw new Error(`Érvénytelen Base32 karakter: ${c}`);
        return i.toString(2).padStart(5, '0');
      }).join('');
      const bytes = bits.match(/.{8}/g) || [];
      return new Uint8Array(bytes.map(b => parseInt(b, 2)));
    },
    _pack64(val) { const b = new ArrayBuffer(8), dv = new DataView(b), hi = Math.floor(val/2**32), lo = Math.floor(val%2**32); dv.setUint32(0, hi); dv.setUint32(4, lo); return b; }
  };

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
        for (const [alias, entry] of Object.entries(obj.profiles)) {
          if (entry && entry.username && entry.password && entry.totp_uri) current.profiles[alias] = entry;
        }
        if (typeof obj.autoLoginEnabled === 'boolean') current.autoLoginEnabled = obj.autoLoginEnabled;
        if (obj.autoLoginProfile && current.profiles[obj.autoLoginProfile]) current.autoLoginProfile = obj.autoLoginProfile;
        Storage.saveCreds(current);
        alert(I18N.importSuccess);
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
      importCredsFromFile(f, () => refreshCredList(root));
      importFile.value = '';
    }, { capture: true });

    attachButton(root.getElementById('kau-close-btn'), () => close());
    attachButton(root.getElementById('kau-save-btn'), () => {
      const alias = root.getElementById('kau-alias').value.trim();
      const username = root.getElementById('kau-username').value.trim();
      const password = root.getElementById('kau-password').value;
      const totp = root.getElementById('kau-totp').value.trim();
      if (!alias || !username || !password || !totp) { alert(I18N.allFieldsRequired); return; }
      const d = Storage.getCreds();
      const uri = totp.startsWith('otpauth://') ? totp : `otpauth://totp/${encodeURIComponent(username)}?secret=${encodeURIComponent(totp)}`;
      d.profiles[alias] = { username, password, totp_uri: uri };
      Storage.saveCreds(d);
      root.getElementById('kau-alias').value = '';
      root.getElementById('kau-username').value = '';
      root.getElementById('kau-password').value = '';
      root.getElementById('kau-totp').value = '';
      refreshCredList(root);
    });

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
        delete d.profiles[alias];
        if (d.autoLoginProfile === alias) d.autoLoginProfile = null;
        Storage.saveCreds(d);
        refreshCredList(root);
      });
    });

    // Set auto-login profile
    div.querySelectorAll('[data-setauto]').forEach(btn => {
      attachButton(btn, () => {
        const alias = btn.getAttribute('data-setauto');
        const d = Storage.getCreds();
        d.autoLoginProfile = alias;
        Storage.saveCreds(d);
        refreshCredList(root);
      });
    });
  }

  // Selection Modal (scrollable)
  function showSelectionModal() {
    const creds = Storage.getCreds(); const names = Object.keys(creds.profiles);
    if (names.length === 0) return;
    if (isManagerOpen()) return; // új védelem: ha manager nyitva, ne jelenjen meg

    const myGen = ++autoLoginGeneration;

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
      <p class="countdown-text">${showCountdown ? I18N.countdownText(10) : I18N.selectToContinue}</p>
      <div class="btn-group">
        <button type="button" id="kau-manage" class="btn-secondary">${I18N.manageCredsBtn}</button>
        <button type="button" id="kau-cancel" class="btn-danger">${I18N.manualLoginBtn}</button>
      </div>
    `;
    root.append(style, overlay, modal);

    let countdownTimer = null;
    const close = () => { if (countdownTimer) clearInterval(countdownTimer); destroy(); };

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
      countdownTimer = setInterval(() => {
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
  function newFlow(alias) {
    const creds = Storage.getCreds(); const profile = creds.profiles[alias]; if (!profile) return null;
    return { id: `${Date.now()}_${Math.random().toString(36).slice(2,8)}`, alias, profile, step: Steps.start, lastHost: location.hostname, startedAt: Date.now() };
  }
  function startFlow(alias) { const f = newFlow(alias); if (f) Storage.setFlow(f); }
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
        u.value = flow.profile.username;
        p.value = flow.profile.password;
        u.dispatchEvent(new Event('input', { bubbles: true }));
        p.dispatchEvent(new Event('input', { bubbles: true }));
        const submit = document.querySelector('input[type="submit"][value="Bejelentkezés"], button[type="submit"]') || p.form && p.form.querySelector('[type="submit"]');
        submit ? submit.click() : (p.form && p.form.submit && p.form.submit());
        updateFlow({ step: Steps.totp });
        return;
      }

      if (onIdpTotpPage() && (flow.step === Steps.totp || flow.step === Steps.password)) {
        const totpField = await waitFor('#identifier', 10000);
        const secret = (new URL(flow.profile.totp_uri)).searchParams.get('secret');
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
    if (onKauDomain()) injectManagerButton();

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
