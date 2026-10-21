// Modul „Aufgaben“: strukturierte To-Dos aus tasks/<bereich>.json.

import { AREAS, STATUSES, PRIORITIES, ConflictError, createTaskStore, newTask } from '../data/tasks.js';
import { esc, icons, prefs as prefStore } from '../ui.js';

const PREFS_KEY = 'dash.tasks.prefs';
const PRIO_RANK = { high: 0, mid: 1, low: 2 };
const AREA_LABEL = Object.fromEntries(AREAS.map((a) => [a.id, a.label]));

function localISODate(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function dueInfo(due) {
  if (!due) return null;
  const today = localISODate();
  const days = Math.round((new Date(`${due}T00:00`) - new Date(`${today}T00:00`)) / 86_400_000);
  const date = new Date(`${due}T00:00`);
  const sameYear = date.getFullYear() === new Date().getFullYear();
  const short = date.toLocaleDateString('de-DE', { day: 'numeric', month: 'numeric', ...(sameYear ? {} : { year: '2-digit' }) });
  if (days < 0) return { cls: 'overdue', text: `Überfällig · ${short}` };
  if (days === 0) return { cls: 'today', text: 'Heute' };
  if (days === 1) return { cls: 'today', text: 'Morgen' };
  if (days < 7) return { cls: '', text: date.toLocaleDateString('de-DE', { weekday: 'long' }) };
  return { cls: '', text: short };
}

function radios(name, options) {
  return Object.entries(options).map(([value, label]) => `
    <label><input type="radio" name="${name}" value="${value}"><span>${
      name === 'priority' ? `<i class="dot ${value}"></i>` : ''}${label}</span></label>`).join('');
}

export default {
  id: 'tasks',
  label: 'Aufgaben',
  icon: icons.tasks,

  mount(el, ctx) {
    const store = createTaskStore(ctx.backend);
    const prefs = prefStore.get(PREFS_KEY, { area: 'all', sort: 'priority', showDone: false });
    let items = [];
    let loaded = false;
    let editing = null; // Original der gerade bearbeiteten Aufgabe, null = neu

    el.innerHTML = `
      <section class="tasks">
        <div class="toolbar">
          <div class="chips" data-chips></div>
          <span class="spacer"></span>
          <label class="select"><span class="sr-only">Sortierung</span>
            <select data-sort>
              <option value="priority">Nach Priorität</option>
              <option value="due">Nach Fälligkeit</option>
            </select>
          </label>
          <label class="switch"><input type="checkbox" data-showdone> Erledigte</label>
          <button class="btn primary add-btn" data-add aria-label="Neue Aufgabe">${icons.plus}<span class="label">Neue Aufgabe</span></button>
        </div>
        <ul class="task-list" data-list></ul>
      </section>

      <dialog class="sheet" data-dialog>
        <form data-form>
          <h2 data-dialog-title></h2>
          <label class="field"><span>Titel</span><input name="title" required maxlength="300" autocomplete="off"></label>
          <label class="field"><span>Notizen</span><textarea name="notes" rows="3"></textarea></label>
          <div class="field-row">
            <label class="field"><span>Bereich</span>
              <select name="area">${AREAS.map((a) => `<option value="${a.id}">${a.label}</option>`).join('')}</select>
            </label>
            <label class="field"><span>Fällig am</span><input type="date" name="due"></label>
          </div>
          <fieldset class="field"><legend>Priorität</legend><div class="seg">${radios('priority', PRIORITIES)}</div></fieldset>
          <fieldset class="field"><legend>Status</legend><div class="seg">${radios('status', STATUSES)}</div></fieldset>
          <div class="dialog-actions">
            <button type="button" class="btn danger ghost" data-delete>Löschen</button>
            <span class="spacer"></span>
            <button type="button" class="btn" data-cancel>Abbrechen</button>
            <button type="submit" class="btn primary">Speichern</button>
          </div>
        </form>
      </dialog>`;

    const $ = (sel) => el.querySelector(sel);
    const list = $('[data-list]');
    const dialog = $('[data-dialog]');
    const form = $('[data-form]');
    $('[data-sort]').value = prefs.sort;
    $('[data-showdone]').checked = prefs.showDone;

    function compare(a, b) {
      const done = (a.status === 'done') - (b.status === 'done');
      if (done) return done;
      const byPrio = (PRIO_RANK[a.priority] ?? 1) - (PRIO_RANK[b.priority] ?? 1);
      const byDue = (a.due || '9999').localeCompare(b.due || '9999');
      const [first, second] = prefs.sort === 'due' ? [byDue, byPrio] : [byPrio, byDue];
      return first || second || (a.created_at || '').localeCompare(b.created_at || '');
    }

    function renderChips() {
      const open = (area) => items.filter((t) => t.status !== 'done' && (area === 'all' || t.area === area)).length;
      const chip = (id, label, dot) => `
        <button class="chip" data-area="${id}" aria-pressed="${prefs.area === id}">
          ${dot ? `<i class="dot ${id}"></i>` : ''}${label}${loaded ? `<span class="count">${open(id)}</span>` : ''}
        </button>`;
      $('[data-chips]').innerHTML = chip('all', 'Alle') + AREAS.map((a) => chip(a.id, a.label, true)).join('');
    }

    function renderTask(t) {
      const due = t.status !== 'done' ? dueInfo(t.due) : null;
      const meta = [
        t.status === 'in_progress' ? '<span class="tag progress">In Arbeit</span>' : '',
        due ? `<span class="tag ${due.cls}">${esc(due.text)}</span>` : '',
        prefs.area === 'all' ? `<span class="tag"><i class="dot ${esc(t.area)}"></i>${esc(AREA_LABEL[t.area] ?? t.area)}</span>` : '',
      ].join('');
      const done = t.status === 'done';
      return `
        <li class="task prio-${esc(t.priority)} ${esc(t.status)}${done ? ' done' : ''}" data-id="${esc(t.id)}">
          <button class="check" data-toggle aria-label="${done ? 'Wieder öffnen' : 'Als erledigt markieren'}"></button>
          <button class="task-main" data-edit title="Priorität: ${esc(PRIORITIES[t.priority] ?? t.priority)}">
            <div class="task-title">${esc(t.title)}</div>
            ${t.notes ? `<div class="task-notes">${esc(t.notes)}</div>` : ''}
            <div class="task-meta">${meta}</div>
          </button>
        </li>`;
    }

    function render() {
      renderChips();
      if (!loaded) {
        list.innerHTML = '<li class="skeleton"></li><li class="skeleton"></li><li class="skeleton"></li>';
        return;
      }
      const shown = items
        .filter((t) => (prefs.area === 'all' || t.area === prefs.area) && (prefs.showDone || t.status !== 'done'))
        .sort(compare);
      list.innerHTML = shown.length
        ? shown.map(renderTask).join('')
        : `<li class="empty">${prefs.showDone ? 'Hier gibt es noch keine Aufgaben.' : 'Nichts offen – schön!'}</li>`;
    }

    function savePrefs() {
      prefStore.set(PREFS_KEY, prefs);
      render();
    }

    async function refresh() {
      const ok = await ctx.run(async () => { items = await store.load(); loaded = true; });
      if (!ok && !loaded) list.innerHTML = '<li class="empty">Aufgaben konnten nicht geladen werden.</li>';
      else render();
    }

    const conflictText = (remote) => {
      const when = new Date(remote.updated_at).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' });
      return `„${remote.title}“ wurde inzwischen an anderer Stelle geändert (${when}).\n\nDeine Version trotzdem speichern und die andere Änderung überschreiben?`;
    };

    // Zeigt die Änderung sofort an und schreibt dann nach Drive; danach gilt der Stand aus Drive.
    async function persist(next, orig) {
      items = [...items.filter((t) => t.id !== next.id), next];
      render();
      await ctx.run(async () => {
        try {
          await store.save(next, { base: orig?.updated_at, fromArea: orig?.area ?? next.area });
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
          if (confirm(conflictText(err.remote))) await store.save(next, { fromArea: orig.area, force: true });
        }
      });
      items = store.all();
      render();
    }

    async function remove(orig) {
      if (!confirm(`„${orig.title}“ endgültig löschen?\n\nTipp: Als „Erledigt“ markieren behält den Eintrag.`)) return;
      items = items.filter((t) => t.id !== orig.id);
      render();
      await ctx.run(async () => {
        try {
          await store.remove(orig);
        } catch (err) {
          if (!(err instanceof ConflictError)) throw err;
          if (confirm(conflictText(err.remote).replace('speichern', 'löschen'))) await store.remove(orig, { force: true });
        }
      });
      items = store.all();
      render();
    }

    function openDialog(task) {
      editing = task;
      const t = task ?? newTask(prefs.area === 'all' ? 'privat' : prefs.area);
      $('[data-dialog-title]').textContent = task ? 'Aufgabe bearbeiten' : 'Neue Aufgabe';
      $('[data-delete]').hidden = !task;
      const f = form.elements; // nicht form.title – das wäre das title-Attribut des Formulars
      f.title.value = t.title;
      f.notes.value = t.notes ?? '';
      f.area.value = t.area;
      f.due.value = t.due ?? '';
      f.priority.value = t.priority;
      f.status.value = t.status;
      dialog.showModal();
      if (!task) f.title.focus();
    }

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const next = {
        ...(editing ?? newTask(fd.get('area'))),
        title: fd.get('title').trim(),
        area: fd.get('area'),
        priority: fd.get('priority'),
        status: fd.get('status'),
      };
      if (!next.title) return;
      // Optionale Felder ganz weglassen statt leer speichern (siehe SCHEMA.md).
      for (const key of ['notes', 'due']) {
        const value = fd.get(key).trim();
        if (value) next[key] = value; else delete next[key];
      }
      const orig = editing;
      dialog.close();
      persist(next, orig);
    });

    $('[data-cancel]').addEventListener('click', () => dialog.close());
    $('[data-delete]').addEventListener('click', () => { const orig = editing; dialog.close(); remove(orig); });
    dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); }); // Klick neben das Sheet
    $('[data-add]').addEventListener('click', () => openDialog(null));
    $('[data-sort]').addEventListener('change', (e) => { prefs.sort = e.target.value; savePrefs(); });
    $('[data-showdone]').addEventListener('change', (e) => { prefs.showDone = e.target.checked; savePrefs(); });

    $('[data-chips]').addEventListener('click', (e) => {
      const chip = e.target.closest('[data-area]');
      if (chip) { prefs.area = chip.dataset.area; savePrefs(); }
    });

    list.addEventListener('click', (e) => {
      const row = e.target.closest('[data-id]');
      const task = row && items.find((t) => t.id === row.dataset.id);
      if (!task) return;
      if (e.target.closest('[data-toggle]')) {
        persist({ ...task, status: task.status === 'done' ? 'open' : 'done' }, task);
      } else if (e.target.closest('[data-edit]')) {
        openDialog(task);
      }
    });

    render();
    refresh();
    return { refresh };
  },
};
