// MeteoTrekking service worker: shell in cache per avvio offline/istantaneo.
// Meteo e radar sempre dalla rete (dati vivi); tile mappa non in cache (peso).
const CACHE = 'meteotrekking-v1';
const SHELL = ['./', './index.html', './manifest.json', './docs/icon-192.png', './docs/icon-512.png'];

// host di risorse statiche che vale la pena tenere in cache (librerie e font)
const STATIC_HOSTS = ['unpkg.com', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const u = new URL(e.request.url);

  // dati vivi: mai dalla cache
  if (u.hostname.includes('open-meteo.com') || u.hostname.includes('rainviewer.com')) return;

  const cacheable = u.origin === location.origin || STATIC_HOSTS.includes(u.hostname);
  if (!cacheable) return;   // tile mappa e resto: rete diretta

  // cache-first con aggiornamento in background (stale-while-revalidate)
  e.respondWith(
    caches.match(e.request).then(hit => {
      const net = fetch(e.request).then(r => {
        if (r.ok) { const cl = r.clone(); caches.open(CACHE).then(c => c.put(e.request, cl)); }
        return r;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
