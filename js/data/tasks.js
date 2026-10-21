// Datenschicht für tasks/<bereich>.json (Schema: Dashboard/SCHEMA.md in Google Drive).
// Jeder Schreibvorgang liest die Datei vorher frisch, falls sie sich geändert hat, und
// ändert nur den betroffenen Eintrag – Änderungen anderer Geräte/Claude an anderen
// Einträgen bleiben so erhalten. Wurde *derselbe* Eintrag zwischenzeitlich geändert,
// gibt es einen ConflictError statt stillem Überschreiben.

export const AREAS = [
  { id: 'studium', label: 'Studium' },
  { id: 'arbeit', label: 'Arbeit' },
  { id: 'privat', label: 'Privat' },
];
export const STATUSES = { open: 'Offen', in_progress: 'In Arbeit', done: 'Erledigt' };
export const PRIORITIES = { high: 'Hoch', mid: 'Mittel', low: 'Niedrig' };

export class ConflictError extends Error {
  constructor(remote) {
    super('Der Eintrag wurde inzwischen an anderer Stelle geändert.');
    this.remote = remote;
  }
}

const fileOf = (area) => `tasks/${area}.json`;

export function newTask(area) {
  const now = new Date().toISOString();
  return { id: crypto.randomUUID(), title: '', status: 'open', priority: 'mid', area, created_at: now, updated_at: now };
}

// Unbekannte Felder bleiben unangetastet – Claude oder spätere Versionen dürfen ergänzen.
function normalize(items, area) {
  if (!Array.isArray(items)) return [];
  return items.filter((t) => t && typeof t === 'object' && t.id).map((t) => ({ ...t, area: t.area || area }));
}

function upsert(items, task) {
  const i = items.findIndex((t) => t.id === task.id);
  return i < 0 ? [...items, task] : items.with(i, task);
}

export function createTaskStore(backend) {
  const files = new Map(); // Bereich → { items, rev }

  async function read(area) {
    const { data, rev } = await backend.readJson(fileOf(area));
    const file = { items: normalize(data?.items, area), rev };
    files.set(area, file);
    return file;
  }

  async function fresh(area) {
    const cur = files.get(area);
    if (cur && cur.rev !== null && (await backend.getRev(fileOf(area))) === cur.rev) return cur;
    return read(area);
  }

  async function mutate(area, fn) {
    const file = await fresh(area);
    const items = fn(file.items);
    const rev = await backend.writeJson(fileOf(area), { items });
    files.set(area, { items, rev });
  }

  async function checkConflict(task, area, base) {
    const remote = (await fresh(area)).items.find((t) => t.id === task.id);
    if (remote && remote.updated_at !== base) throw new ConflictError(remote);
  }

  return {
    async load() {
      await Promise.all(AREAS.map(({ id }) => read(id)));
      return this.all();
    },

    all: () => [...files.values()].flatMap((f) => f.items),

    // base: updated_at des Eintrags, wie er beim Bearbeiten angezeigt wurde (fehlt bei neuen Einträgen).
    // fromArea: bisheriger Bereich, falls die Aufgabe in einen anderen Bereich verschoben wird.
    async save(task, { base, fromArea = task.area, force = false } = {}) {
      if (base && !force) await checkConflict(task, fromArea, base);
      const next = { ...task, updated_at: new Date().toISOString() };
      // Erst im Ziel eintragen, dann im alten Bereich entfernen: bricht es dazwischen ab,
      // gibt es schlimmstenfalls ein Duplikat, aber keinen Datenverlust.
      await mutate(next.area, (items) => upsert(items, next));
      if (fromArea !== next.area) await mutate(fromArea, (items) => items.filter((t) => t.id !== next.id));
      return next;
    },

    async remove(task, { force = false } = {}) {
      if (!force) await checkConflict(task, task.area, task.updated_at);
      await mutate(task.area, (items) => items.filter((t) => t.id !== task.id));
    },
  };
}
