const CACHE_NAME = "demanda-gustavo-v1";
const APP_SHELL = [
  "/",
  "/index.html",
  "/manifest.webmanifest",
  "/pwa-192x192.png",
  "/pwa-512x512.png",
  "/favicon.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k !== CACHE_NAME)
            .map((k) => caches.delete(k))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  // Always hit network directly for API endpoints
  if (url.pathname.startsWith("/api/")) return;

  event.respondWith(
    fetch(request)
      .then((networkRes) => {
        if (networkRes && networkRes.status === 200 && url.origin === self.location.origin) {
          const clone = networkRes.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
        }
        return networkRes;
      })
      .catch(() =>
        caches.match(request).then((cached) => cached || caches.match("/index.html"))
      )
  );
});
