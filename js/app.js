// App-Rahmen: Anmeldung, Navigation zwischen Modulen, gemeinsamer Kontext (ctx) für alle Module.

import { CONFIG } from '../config.js';
import { isConfigured, getToken, signIn, signOut, clearToken } from './auth.js';
import { createDriveBackend, AuthError } from './backends/drive.js';
import { createDemoBackend, resetDemo } from './backends/demo.js';
import { modules } from './modules/index.js';
import { esc, toast, icons } from './ui.js';

const MODE_KEY = 'dash.mode'; // 'drive' | 'demo'
const REFRESH_ON_RETURN_MS = 30_000;
const root = document.getElementById('app');

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('sw.js').catch((err) => console.warn('Service Worker nicht registriert:', err));
}

const getMode = () => { try { return localStorage.getItem(MODE_KEY); } catch { return null; } };
const setMode = (mode) => {
  try { if (mode) localStorage.setItem(MODE_KEY, mode); else localStorage.removeItem(MODE_KEY); } catch { /* egal */ }
};
const driveBackend = () => createDriveBackend({ rootId: CONFIG.dashboardFolderId, getToken });

function start() {
  const mode = getMode();
  if (mode === 'demo') return shell(createDemoBackend());
  if (mode === 'drive' && getToken()) return shell(driveBackend());
  showLogin(mode === 'drive');
}

function showLogin(returning) {
  root.innerHTML = `
    <main class="login">
      <div class="login-card">
        <img src="icons/icon-192.png" alt="">
        <h1>Dashboard</h1>
        <p>Aufgaben, Notizen und Termine – Studium, Arbeit, Privat.</p>
        <button class="btn primary" data-google ${isConfigured() ? '' : 'disabled'}>
          ${returning ? 'Weiter mit Google' : 'Mit Google anmelden'}
        </button>
        <button class="btn" data-demo>Demo ansehen</button>
        ${isConfigured() ? '' : '<p class="hint">In <code>config.js</code> ist noch keine Google-Client-ID eingetragen – siehe README.</p>'}
      </div>
    </main>`;

  const googleBtn = root.querySelector('[data-google]');
  googleBtn.addEventListener('click', async () => {
    googleBtn.disabled = true;
    try {
      await signIn();
      setMode('drive');
      shell(driveBackend());
    } catch (err) {
      console.warn('Anmeldung fehlgeschlagen:', err);
      toast(err.message, 'error', 8000);
      googleBtn.disabled = false;
    }
  });
  root.querySelector('[data-demo]').addEventListener('click', () => {
    setMode('demo');
    shell(createDemoBackend());
  });
}

function shell(backend) {
  const isDemo = backend.kind === 'demo';
  let busy = 0;
  let current = {};
  let lastRefresh = 0;

  root.innerHTML = `
    <div class="app${modules.length < 2 ? ' single-module' : ''}">
      <header class="topbar">
        <h1>Dashboard</h1>
        <span class="status" data-status></span>
        <span class="spacer"></span>
        <button class="btn ghost icon" data-refresh title="Aktualisieren" aria-label="Aktualisieren">${icons.refresh}</button>
        <button class="btn ghost icon" data-logout title="${isDemo ? 'Demo beenden' : 'Abmelden'}" aria-label="${isDemo ? 'Demo beenden' : 'Abmelden'}">${icons.logout}</button>
      </header>
      <nav class="nav"${modules.length < 2 ? ' hidden' : ''}>
        ${modules.map((m) => `<a href="#/${m.id}" data-module="${m.id}">${m.icon}<span>${esc(m.label)}</span></a>`).join('')}
      </nav>
      <main class="content">
        <div class="banner" data-banner hidden>
          <span>Die Google-Anmeldung ist abgelaufen.</span><span class="spacer"></span>
          <button class="btn primary" data-relogin>Neu anmelden</button>
        </div>
        <div data-view></div>
      </main>
    </div>`;

  const $ = (sel) => root.querySelector(sel);
  const statusEl = $('[data-status]');
  const idleStatus = isDemo ? 'Demo' : '';
  statusEl.textContent = idleStatus;

  function setBusy(delta) {
    busy += delta;
    if (busy > 0) statusEl.textContent = 'Synchronisiere …';
    else if (statusEl.textContent === 'Synchronisiere …') statusEl.textContent = idleStatus;
  }

  function handleError(err) {
    console.error(err);
    if (err instanceof AuthError) {
      clearToken();
      $('[data-banner]').hidden = false;
    } else if (err instanceof TypeError || !navigator.onLine) {
      statusEl.textContent = 'Offline';
      toast('Keine Verbindung zu Google Drive – Änderungen werden erst ab Schritt 4 offline gepuffert.', 'error', 5000);
    } else {
      toast(err.message, 'error', 5000);
    }
  }

  const ctx = {
    backend,
    // Führt einen Datenzugriff aus, zeigt den Sync-Status und meldet Fehler einheitlich. → true/false
    async run(fn) {
      setBusy(1);
      try {
        await fn();
        if (statusEl.textContent === 'Offline') statusEl.textContent = idleStatus;
        return true;
      } catch (err) {
        handleError(err);
        return false;
      } finally {
        setBusy(-1);
      }
    },
  };

  function refresh() {
    lastRefresh = Date.now();
    current.refresh?.();
  }

  function route() {
    const id = location.hash.replace(/^#\/?/, '') || modules[0].id;
    const mod = modules.find((m) => m.id === id) ?? modules[0];
    current.unmount?.();
    const view = $('[data-view]');
    view.replaceChildren();
    current = mod.mount(view, ctx) ?? {};
    lastRefresh = Date.now();
    document.title = `${mod.label} · Dashboard`;
    root.querySelectorAll('[data-module]').forEach((a) => {
      if (a.dataset.module === mod.id) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
  }

  $('[data-refresh]').addEventListener('click', refresh);
  $('[data-relogin]').addEventListener('click', async () => {
    try {
      await signIn();
      $('[data-banner]').hidden = true;
      refresh();
    } catch (err) {
      toast(err.message, 'error');
    }
  });
  $('[data-logout]').addEventListener('click', () => {
    if (isDemo) {
      if (!confirm('Demo beenden? Die Demo-Daten werden dabei zurückgesetzt.')) return;
      resetDemo();
    } else {
      signOut();
    }
    setMode(null);
    current.unmount?.();
    document.onvisibilitychange = null;
    window.onhashchange = null;
    showLogin(false);
  });

  // Zurück in die App (z. B. nach Bearbeitung durch Claude am PC) → Daten neu holen.
  document.onvisibilitychange = () => {
    if (document.visibilityState === 'visible' && Date.now() - lastRefresh > REFRESH_ON_RETURN_MS) refresh();
  };
  window.onhashchange = route;
  route();
}

start();
