const CACHE = "netaj-shell-v1";
const SHELL = ["/", "/manifest.webmanifest", "/icon.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET" || new URL(event.request.url).origin !== self.location.origin) return;
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request).catch(() => {
      // Never mask a failed deep link (for example /accounting?tab=chart)
      // with the cached dashboard. That makes the address and page disagree.
      const url = new URL(event.request.url);
      return url.pathname === "/" ? caches.match("/") : Response.error();
    }));
    return;
  }
  // API responses must always come from the live server; serving an old
  // cached response can make a section appear to contain another section's data.
  if (new URL(event.request.url).pathname.startsWith("/api/")) {
    event.respondWith(fetch(event.request));
    return;
  }
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});
