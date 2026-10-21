// Speicher-Backend für den Drive-Ordner „Dashboard“.
// Alle Module sprechen nur über diese Schnittstelle mit den Daten:
//   readJson(path) → { data, rev }    getRev(path) → rev    writeJson(path, data) → rev
// path ist relativ zum Dashboard-Ordner, z. B. "tasks/studium.json".
// rev ist Drives Versionszähler der Datei – ändert ihn jemand anders (PC, Claude), merken wir das.

const API = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files';

export class AuthError extends Error {}

export function createDriveBackend({ rootId, getToken }) {
  const ids = new Map(); // Pfad → Drive-ID

  async function api(url, options = {}) {
    const token = getToken();
    if (!token) throw new AuthError('Nicht (mehr) angemeldet.');
    const res = await fetch(url, { ...options, headers: { Authorization: `Bearer ${token}`, ...options.headers } });
    if (res.status === 401) throw new AuthError('Die Google-Anmeldung ist abgelaufen.');
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(`Google Drive meldet ${res.status}: ${body?.error?.message ?? res.statusText}`);
    }
    return res;
  }

  async function findChild(parentId, name) {
    const q = `'${parentId}' in parents and name = '${name.replace(/'/g, "\\'")}' and trashed = false`;
    const res = await api(`${API}?${new URLSearchParams({ q, fields: 'files(id)', pageSize: '2' })}`);
    return (await res.json()).files[0]?.id ?? null;
  }

  async function resolve(path) {
    if (path === '') return rootId;
    if (ids.has(path)) return ids.get(path);
    const cut = path.lastIndexOf('/');
    const parentId = await resolve(cut < 0 ? '' : path.slice(0, cut));
    if (!parentId) return null;
    const id = await findChild(parentId, path.slice(cut + 1));
    if (id) ids.set(path, id);
    return id;
  }

  async function getRev(path) {
    const id = await resolve(path);
    if (!id) return null;
    const res = await api(`${API}/${id}?fields=version`);
    return (await res.json()).version;
  }

  async function readJson(path) {
    const id = await resolve(path);
    if (!id) return { data: null, rev: null };
    // Version zuerst lesen: ändert sich die Datei dazwischen, ist unsere rev höchstens zu alt –
    // dann liest der nächste Schreibvorgang neu, statt etwas zu überschreiben.
    const rev = await getRev(path);
    const text = await (await api(`${API}/${id}?alt=media`)).text();
    return { data: text.trim() ? JSON.parse(text) : null, rev };
  }

  async function writeJson(path, data) {
    const content = `${JSON.stringify(data, null, 2)}\n`;
    const id = await resolve(path);
    if (id) {
      const res = await api(`${UPLOAD}/${id}?uploadType=media&fields=version`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json; charset=UTF-8' },
        body: content,
      });
      return (await res.json()).version;
    }

    // Datei fehlt (z. B. versehentlich gelöscht) → im vorhandenen Unterordner neu anlegen.
    const cut = path.lastIndexOf('/');
    const parentId = await resolve(cut < 0 ? '' : path.slice(0, cut));
    if (!parentId) throw new Error(`Ordner für „${path}“ fehlt in Google Drive.`);
    const boundary = `dash-${crypto.randomUUID()}`;
    const meta = { name: path.slice(cut + 1), parents: [parentId], mimeType: 'application/json' };
    const body = [
      `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', JSON.stringify(meta),
      `--${boundary}`, 'Content-Type: application/json; charset=UTF-8', '', content,
      `--${boundary}--`,
    ].join('\r\n');
    const res = await api(`${UPLOAD}?uploadType=multipart&fields=id,version`, {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    const file = await res.json();
    ids.set(path, file.id);
    return file.version;
  }

  return { kind: 'drive', readJson, getRev, writeJson };
}
