// Service Worker: hält die App-Shell offline verfügbar.
// Strategie „network first“: online immer die aktuelle Version, offline (oder nach 3 s ohne Antwort)
// die zuletzt gespeicherte. Dadurch muss bei Updates keine Cache-Version hochgezählt werden.
// Anfragen an Google (Drive, Login) gehen am Service Worker vorbei.

const CACHE = 'dashboard-shell';
const SHELL = [
  './',
  'index.html',
  'manifest.webmanifest',
  'config.js',
  'css/app.css',
  'js/app.js',
  'js/ui.js',
  'js/auth.js',
  'js/modules/index.js',
  'js/modules/tasks.js',
  'js/data/tasks.js',
  'js/backends/drive.js',
  'js/backends/demo.js',
  'icons/icon.svg',
  'icons/icon-192.png',
];
const TIMEOUT_MS = 3000;

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  event.respondWith(networkFirst(req));
});

async function networkFirst(req) {
  const cache = await caches.open(CACHE);
  const network = fetch(req).then((res) => {
    if (res.ok) cache.put(req, res.clone());
    return res;
  });
  const timeout = new Promise((resolve) => setTimeout(resolve, TIMEOUT_MS));
  const res = await Promise.race([network, timeout]).catch(() => undefined);
  if (res) return res;

  const cached = (await cache.match(req, { ignoreSearch: true }))
    ?? (req.mode === 'navigate' ? await cache.match('index.html') : undefined);
  return cached ?? network;
}
