// Offline shell: the board, the public sessions and the scripts. /api is never cached.
const VERSION = "__BUILD__";
const SHELL = ["/", "/index.html", "/chess.min.js", "/store.js", "/pieces.js", "/config.js", "/hosted.js",
  "/session-board.js", "/sessions/bundle.js", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin || url.pathname.startsWith("/api/")) return;
  // Network first, so a deploy shows at once; the cache answers when offline.
  e.respondWith(fetch(e.request).then(function (r) {
    const copy = r.clone();
    if (r.ok) caches.open(VERSION).then(function (c) { c.put(e.request, copy); });
    return r;
  }).catch(function () {
    return caches.match(e.request, { ignoreSearch: true }).then(function (hit) { return hit || caches.match("/index.html"); });
  }));
});
