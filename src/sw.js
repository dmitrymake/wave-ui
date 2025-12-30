const CACHE_NAME = "covers-v1";

// кешируем обложки
const ASSET_REGEX = /\/coverart\.php|\/imagesw\//;

self.addEventListener("install", (event) => {
  self.skipWaiting(); // Активируем сразу после загрузки
});

self.addEventListener("activate", (event) => {
  // Очистка старых кэшей, если имя изменится
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
      .then(() => self.clients.claim()), // Немедленно берем контроль над страницей
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // Проверяем, GET запрос ли это и соответствует ли нашим путям картинок
  if (request.method !== "GET" || !ASSET_REGEX.test(url.pathname)) {
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.match(request).then((cachedResponse) => {
        if (cachedResponse) {
          return cachedResponse;
        }

        // 2. Если нет в кэше — идем в сеть
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
          .catch(() => {
            // return caches.match('/images/default_icon.png');
          });
      });
    }),
  );
});
