// Demo-Backend: dieselbe Schnittstelle wie drive.js, aber nur im Browser (localStorage).
// Zum Ausprobieren der Oberfläche ohne Google-Konto.

const KEY = 'dash.demo';

function seed() {
  const now = new Date();
  const day = (offset) => {
    const d = new Date(now);
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  };
  const ts = now.toISOString();
  const task = (area, title, priority, extra = {}) => ({
    id: crypto.randomUUID(), title, status: 'open', priority, area, created_at: ts, updated_at: ts, ...extra,
  });
  const files = {
    'tasks/studium.json': [
      task('studium', 'Methodenteil Doktorarbeit überarbeiten', 'high', { due: day(2), status: 'in_progress', notes: 'Kommentare von der Betreuung einarbeiten.' }),
      task('studium', 'Literaturliste aktualisieren', 'low'),
      task('studium', 'Anmeldung Prüfung abschicken', 'mid', { due: day(-1) }),
    ],
    'tasks/arbeit.json': [
      task('arbeit', 'Folien für Montag fertigstellen', 'high', { due: day(0) }),
      task('arbeit', 'Urlaubsantrag stellen', 'mid', { due: day(9) }),
    ],
    'tasks/privat.json': [
      task('privat', 'Steuererklärung', 'mid', { due: day(30) }),
      task('privat', 'Fahrrad zur Inspektion', 'low', { status: 'done' }),
    ],
  };
  return Object.fromEntries(Object.entries(files).map(([path, items]) => [path, { data: { items }, rev: 1 }]));
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY));
    if (raw) return raw;
  } catch { /* neu anlegen */ }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(db) {
  try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* nur im Speicher */ }
}

export function createDemoBackend() {
  const db = load();
  return {
    kind: 'demo',
    async readJson(path) {
      const f = db[path];
      return f ? structuredClone(f) : { data: null, rev: null };
    },
    async getRev(path) {
      return db[path]?.rev ?? null;
    },
    async writeJson(path, data) {
      const rev = (db[path]?.rev ?? 0) + 1;
      db[path] = { data: structuredClone(data), rev };
      save(db);
      return rev;
    },
  };
}

export function resetDemo() {
  try { localStorage.removeItem(KEY); } catch { /* egal */ }
}
