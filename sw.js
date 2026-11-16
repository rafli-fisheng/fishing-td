/* Fishing Torque & Drag: offline cache. Bump VERSION when the app changes. */
var VERSION = 'tdfish-v2';
var FILES = ['./', './index.html', './manifest.webmanifest', './icon-192.png', './icon-512.png', './icon-maskable-512.png', './apple-touch-icon.png', './favicon.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(FILES); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  if (e.request.method !== 'GET') return;
  /* network first for the page so updates arrive, cache when offline */
  if (e.request.mode === 'navigate') { e.respondWith(fetch(e.request).then(function (r) { var c = r.clone(); caches.open(VERSION).then(function (cc) { cc.put('./index.html', c); }); return r; }).catch(function () { return caches.match('./index.html'); })); return; }
  e.respondWith(caches.match(e.request).then(function (r) { return r || fetch(e.request); }));
});
