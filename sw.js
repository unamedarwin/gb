const STATIC_CACHE = "gymbros-shell-v5";
const IMAGE_CACHE = "gymbros-images-v1";
const APP_SHELL = [
  "./",
  "./index.html",
  "./assets/styles.css",
  "./assets/app.js",
  "./assets/vendor/alpinejs-3.14.9.min.js",
  "./assets/js/config.js",
  "./assets/js/bodyweight-library.js",
  "./assets/js/storage.js",
  "./assets/js/catalog.js",
  "./assets/js/logging-catalog.js",
  "./assets/js/proportionality.js",
  "./assets/js/recommendations.js",
  "./assets/js/migrations.js",
  "./assets/js/shell-ui.js",
  "./assets/js/main.js",
  "./manifest.webmanifest",
  "./assets/icons/apple-touch-icon.png",
  "./assets/icons/icon-192.png",
  "./assets/icons/icon-512.png",
  "./assets/icons/icon-maskable-512.png",
  "./assets/illustrations/bodyweight/lucide-dumbbell.svg",
  "./assets/illustrations/bodyweight/lucide-person-standing.svg",
  "./assets/illustrations/bodyweight/lucide-activity.svg",
  "./assets/illustrations/bodyweight/lucide-heart-pulse.svg",
  "./assets/graphics/body-map.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(STATIC_CACHE).then((cache) => cache.addAll(APP_SHELL)),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys
        .filter((key) => key !== STATIC_CACHE && key !== IMAGE_CACHE)
        .map((key) => caches.delete(key)),
    )).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const requestUrl = new URL(event.request.url);

  if (requestUrl.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(STATIC_CACHE).then((cache) => cache.put(event.request, copy));
          }
          return response;
        })
        .catch(() => caches.match(event.request)),
    );
    return;
  }

  if (requestUrl.hostname === "cdn.shopify.com") {
    event.respondWith(
      caches.open(IMAGE_CACHE).then(async (cache) => {
        const cached = await cache.match(event.request);
        if (cached) {
          return cached;
        }
        const response = await fetch(event.request);
        if (response.ok) {
          cache.put(event.request, response.clone());
        }
        return response;
      }),
    );
  }
});
