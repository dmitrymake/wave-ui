const CACHE_NAME = "covers-v1";

const ASSET_REGEX = /\/coverart\.php|\/imagesw\//;

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) {
              return caches.delete(cache);
            }
          }),
        );
      })
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  if (request.method !== "GET" || !ASSET_REGEX.test(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        return fetch(request)
          .then((networkResponse) => {
            if (
              !networkResponse ||
              networkResponse.status !== 200 ||
              networkResponse.type === "error"
            ) {
              return networkResponse;
            }

            cache.put(request, networkResponse.clone());

            return networkResponse;
          })
          .catch(() => {});
      });
    }),
  );
});
