// Google-Anmeldung über Google Identity Services (Token-Flow, ohne eigenen Server).
// Ein Access-Token gilt ca. 1 Stunde; danach wird per Knopfdruck neu angefordert
// (bei bereits erteilter Zustimmung schließt sich das Google-Fenster sofort wieder).

import { CONFIG } from '../config.js';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const TOKEN_KEY = 'dash.token';
const EXPIRY_MARGIN_MS = 60_000;

let tokenClient = null;
let pending = null;

export const isConfigured = () => Boolean(CONFIG.googleClientId);

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = GIS_SRC;
    s.async = true;
    s.onload = resolve;
    s.onerror = () => reject(new Error('Google-Anmeldung konnte nicht geladen werden – bist du offline?'));
    document.head.append(s);
  });
}

function stored() {
  try {
    const t = JSON.parse(localStorage.getItem(TOKEN_KEY));
    if (t?.accessToken && t.expiresAt > Date.now() + EXPIRY_MARGIN_MS) return t;
  } catch { /* nichts gespeichert */ }
  return null;
}

export const getToken = () => stored()?.accessToken ?? null;

export function clearToken() {
  try { localStorage.removeItem(TOKEN_KEY); } catch { /* egal */ }
}

function onToken(resp) {
  if (resp.error) console.warn('Google-Antwort:', resp);
  const p = pending;
  pending = null;
  if (!p) return;
  if (resp.error) return p.reject(new Error(`Anmeldung fehlgeschlagen: ${resp.error_description || resp.error}`));
  if (!google.accounts.oauth2.hasGrantedAllScopes(resp, ...CONFIG.scopes)) {
    return p.reject(new Error('Der Zugriff auf Google Drive wurde nicht erlaubt.'));
  }
  const token = { accessToken: resp.access_token, expiresAt: Date.now() + Number(resp.expires_in) * 1000 };
  try { localStorage.setItem(TOKEN_KEY, JSON.stringify(token)); } catch { /* nur für diese Sitzung */ }
  p.resolve(token.accessToken);
}

function onError(err) {
  console.warn('Google-Anmeldefenster:', err);
  const p = pending;
  pending = null;
  p?.reject(new Error(err.type === 'popup_closed' ? 'Anmeldefenster wurde geschlossen.' : `Anmeldung fehlgeschlagen (${err.type}).`));
}

// Muss aus einem Klick heraus aufgerufen werden, sonst blockiert der Browser das Google-Fenster.
export async function signIn() {
  await loadGis();
  tokenClient ??= google.accounts.oauth2.initTokenClient({
    client_id: CONFIG.googleClientId,
    scope: CONFIG.scopes.join(' '),
    callback: onToken,
    error_callback: onError,
  });
  return new Promise((resolve, reject) => {
    pending = { resolve, reject };
    tokenClient.requestAccessToken({ prompt: '' });
  });
}

export function signOut() {
  const token = getToken();
  clearToken();
  if (token && window.google?.accounts?.oauth2) google.accounts.oauth2.revoke(token, () => {});
}
