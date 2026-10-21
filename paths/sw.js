/* رستا — نشانی قدیمی /paths/ : این کارگر فقط خودش را پاک می‌کند و صفحه را به نشانی اصلی می‌برد */
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.indexOf('rasta-paths-') === 0) await caches.delete(k);
  await self.registration.unregister();
  for (const c of await self.clients.matchAll({type: 'window'})) c.navigate(new URL('../', self.registration.scope).href);
})()));
