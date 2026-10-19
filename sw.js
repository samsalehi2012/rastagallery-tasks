/* رستا — service worker: works offline, always prefers the newest version when online */
const VER = 'rasta-v3-92154';
const FILES = ["./", "index.html", "install.html", "manifest.webmanifest", "assets/app.css", "assets/app.js", "assets/morphdom.min.js", "assets/fonts/Vazirmatn-Variable.woff2", "assets/img/apple-touch-icon.png", "assets/img/favicon-32.png", "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/icon-maskable-512.png", "assets/img/rasta-logo-inverse.svg", "assets/img/rasta-logo-tile.svg", "assets/img/rasta-logo.png"];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('fetch', e => {
  const r = e.request;
  if (r.method !== 'GET' || new URL(r.url).origin !== location.origin) return;
  e.respondWith(fetch(r).then(res => { const copy = res.clone(); caches.open(VER).then(c => c.put(r, copy)); return res; })
    .catch(() => caches.match(r, {ignoreSearch: true}).then(m => m || caches.match('index.html'))));
});
