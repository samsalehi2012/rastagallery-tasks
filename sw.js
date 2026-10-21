/* رستا — service worker: works offline, always loads the newest version when online */
const VER = 'rasta-56614';
const FILES = ["./", "index.html", "install.html", "guide.html", "manifest.webmanifest", "assets/app.css", "assets/app.js", "assets/morphdom.min.js", "assets/fonts/Vazirmatn-Variable.woff2", "assets/img/apple-touch-icon.png", "assets/img/favicon-32.png", "assets/img/icon-192.png", "assets/img/icon-512.png", "assets/img/icon-maskable-512.png", "assets/img/rasta-logo-inverse.svg", "assets/img/rasta-logo-tile.svg", "assets/img/rasta-logo.png"];
const SKIP = [];
self.addEventListener('install', e => { e.waitUntil(caches.open(VER).then(c => c.addAll(FILES)).then(() => self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener('message', e => { if (e.data === 'skip') self.skipWaiting(); });
self.addEventListener('fetch', e => {
  const r = e.request, u = new URL(r.url);
  if (r.method !== 'GET' || u.origin !== location.origin) return;
  const base = new URL('./', self.registration.scope).pathname;
  if (SKIP.some(p => u.pathname.startsWith(base + p))) return;
  /* always ask the server first (bypassing the browser cache) so a new upload shows up at once */
  e.respondWith(fetch(r.url, {cache: 'no-cache', credentials: 'same-origin'}).then(res => { if (res.ok) { const copy = res.clone(); caches.open(VER).then(c => c.put(r, copy)); } return res; })
    .catch(() => caches.match(r, {ignoreSearch: true}).then(m => m || (r.mode === 'navigate' ? caches.match('index.html') : Response.error()))));
});
