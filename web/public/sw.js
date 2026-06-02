const CACHE = "ningyi-v1";
const ASSETS = ["/", "/index.html"];

self.addEventListener("install", (e: Event) => {
  const evt = e as ExtendableEvent;
  evt.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(ASSETS)).catch(() => {}),
  );
  self.skipWaiting();
});

self.addEventListener("fetch", (e: Event) => {
  const evt = e as FetchEvent;
  if (evt.request.method !== "GET") return;
  evt.respondWith(
    caches.match(evt.request).then(
      (cached) => cached || fetch(evt.request),
    ),
  );
});
