// Modul-Registry: Reihenfolge = Reihenfolge in der Navigation.
// Neues Modul = neue Datei in js/modules/ + eine Zeile hier (und im SHELL-Array von sw.js).
// Ein Modul exportiert { id, label, icon, mount(el, ctx) → { refresh?(), unmount?() } }.

import tasks from './tasks.js';

export const modules = [tasks];
