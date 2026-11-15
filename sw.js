// Guarda la app en el móvil para que abra sin conexión.
// Sube VERSION cada vez que cambies un archivo de la app.
const VERSION = 'diario-v5';
const FILES = ['./', 'index.html', 'styles.css?v=5', 'plan.js?v=5', 'app.js?v=5', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  // Las llamadas a Google (Apps Script) no se tocan: van siempre a la red.
  if (e.request.method !== 'GET' || url.origin !== self.location.origin) return;
  // Red primero (para recibir actualizaciones), caché si no hay conexión.
  e.respondWith(
    // no-cache: pregunta siempre a GitHub si hay versión nueva (evita mezclar archivos viejos y nuevos).
    fetch(e.request, { cache: 'no-cache' })
      .then(res => {
        const copy = res.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html')))
  );
});
